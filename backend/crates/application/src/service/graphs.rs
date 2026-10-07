//! Evidence-grounded graph validation and audience-specific projections.
use super::*;

impl PlatformService {
    pub async fn my_graph(&self, session: &SessionView) -> Result<GraphView, ApplicationError> {
        let candidate_id = candidate_id(session)?;
        let record = self.candidate_index(candidate_id).await?;
        self.graph_from_skills("self", &record.profile.team_role, &record.skills)
            .await
    }

    pub async fn candidate_graph(
        &self,
        session: &SessionView,
        requested_candidate_id: &str,
    ) -> Result<GraphView, ApplicationError> {
        employer_company_id(session)?;
        let record = self.candidate_index(requested_candidate_id).await?;
        if !record.profile.visible_to_employers(record.email_verified) {
            return Err(ApplicationError::new(
                404,
                "not_found",
                "Кандидат не найден",
            ));
        }
        self.graph_from_skills("employer", &record.profile.team_role, &record.skills)
            .await
    }

    async fn graph_from_skills(
        &self,
        audience: &'static str,
        subject: &str,
        skills: &[fsp_domain::SkillEvidence],
    ) -> Result<GraphView, ApplicationError> {
        if let Some(llm) = &self.llm
            && !skills.is_empty()
        {
            let extracted = llm
                .extract_graph(&fsp_domain::GraphExtractionRequest {
                    schema_version: "competence-graph-v1",
                    subject: "Профиль компетенций".into(),
                    evidence: skills
                        .iter()
                        .map(|skill| fsp_domain::LlmEvidence {
                            reference: format!("skill:{}", skill.skill_id),
                            text: format!(
                                "{}; status={:?}; grade={:?}; sources={:?}",
                                skill.skill_id, skill.status, skill.evidence_grade, skill.sources
                            ),
                        })
                        .collect(),
                })
                .await
                .map_err(integration_error)?;
            return graph_from_extracted(audience, skills, extracted);
        }
        let root = GraphNodeView {
            id: "role-main".into(),
            kind: "role".into(),
            label: if audience == "employer" || subject.trim().is_empty() {
                "Профиль компетенций".into()
            } else {
                subject.into()
            },
            skill_id: None,
            status: None,
        };
        let mut nodes = vec![root];
        let mut edges = Vec::new();
        for skill in skills {
            let id = format!("skill-{}", skill.skill_id);
            nodes.push(GraphNodeView {
                id: id.clone(),
                kind: "skill".into(),
                label: skill_label(&skill.skill_id).into(),
                skill_id: Some(skill.skill_id.clone()),
                status: Some(evidence_status_name(skill.status).into()),
            });
            edges.push(GraphEdgeView {
                id: format!("edge-role-{}", skill.skill_id),
                from: "role-main".into(),
                to: id.clone(),
                relation: "uses".into(),
            });
            // Evidence nodes are disclosed only to the candidate, as in the
            // mock's `graph(candidate, audience)`.
            if audience == "self" {
                for index in 0..skill.sources.len() {
                    let evidence_id = format!("evidence-{}-{index}", skill.skill_id);
                    nodes.push(GraphNodeView {
                        id: evidence_id.clone(),
                        kind: "evidence".into(),
                        label: format!("Свидетельство: {}", skill_label(&skill.skill_id)),
                        skill_id: None,
                        status: None,
                    });
                    edges.push(GraphEdgeView {
                        id: format!("edge-{evidence_id}"),
                        from: evidence_id,
                        to: id.clone(),
                        relation: "supports".into(),
                    });
                }
            }
        }
        Ok(GraphView {
            audience,
            nodes,
            edges,
            simulation: true,
        })
    }
}

fn graph_from_extracted(
    audience: &'static str,
    skills: &[fsp_domain::SkillEvidence],
    graph: fsp_domain::ExtractedGraph,
) -> Result<GraphView, ApplicationError> {
    use std::collections::{BTreeMap, BTreeSet};
    let invalid = || {
        ApplicationError::new(
            502,
            "bifrost_invalid_response",
            "Модель вернула граф неподдерживаемого формата",
        )
    };
    if graph.nodes.is_empty() || graph.nodes.len() > 128 || graph.edges.len() > 512 {
        return Err(invalid());
    }
    let known: BTreeMap<_, _> = skills
        .iter()
        .map(|skill| (skill.skill_id.as_str(), skill))
        .collect();
    let references: BTreeSet<_> = skills
        .iter()
        .map(|skill| format!("skill:{}", skill.skill_id))
        .collect();
    let valid_references = |refs: &[String]| refs.iter().all(|value| references.contains(value));
    let mut identities = BTreeMap::new();
    let mut seen_skills = BTreeSet::new();
    let mut role_count = 0;
    let mut nodes = Vec::new();
    for (index, node) in graph.nodes.into_iter().enumerate() {
        if node.id.is_empty()
            || node.id.len() > 256
            || identities.contains_key(&node.id)
            || !valid_references(&node.evidence_references)
        {
            return Err(invalid());
        }
        let kind = if node.kind.is_empty() {
            if node.skill_id.is_some() {
                "skill".into()
            } else if node.evidence_references.is_empty() {
                "role".into()
            } else {
                "evidence".into()
            }
        } else {
            node.kind.to_lowercase()
        };
        let (id, label, skill_id, status) = match kind.as_str() {
            "role" => {
                role_count += 1;
                ("role-main".into(), "Профиль компетенций".into(), None, None)
            }
            "skill" => {
                let skill_id = node.skill_id.as_deref().ok_or_else(invalid)?;
                let skill = known.get(skill_id).ok_or_else(invalid)?;
                if !seen_skills.insert(skill_id.to_owned())
                    || !node
                        .evidence_references
                        .contains(&format!("skill:{skill_id}"))
                {
                    return Err(invalid());
                }
                // Labels, grades and evidence states are facts owned by the
                // application. A model may propose graph relations, never upgrade a skill.
                (
                    format!("skill-{skill_id}"),
                    skill_label(skill_id).into(),
                    Some(skill_id.to_owned()),
                    Some(evidence_status_name(skill.status).into()),
                )
            }
            "evidence" if !node.evidence_references.is_empty() => (
                format!("evidence-{index}"),
                "Свидетельство навыка".into(),
                None,
                None,
            ),
            _ => return Err(invalid()),
        };
        identities.insert(node.id, id.clone());
        if audience != "employer" || kind != "evidence" {
            nodes.push(GraphNodeView {
                id,
                kind,
                label,
                skill_id,
                status,
            });
        }
    }
    if role_count != 1 || seen_skills.len() != known.len() {
        return Err(invalid());
    }
    let visible: BTreeSet<_> = nodes.iter().map(|node| node.id.clone()).collect();
    let mut edge_ids = BTreeSet::new();
    let mut pairs = BTreeSet::new();
    let mut edges = Vec::new();
    for (index, edge) in graph.edges.into_iter().enumerate() {
        let relation = edge.relation.to_lowercase();
        if edge.id.is_empty()
            || edge.id.len() > 256
            || !edge_ids.insert(edge.id)
            || !["requires", "supports", "uses"].contains(&relation.as_str())
            || edge.evidence_references.is_empty()
            || !valid_references(&edge.evidence_references)
        {
            return Err(invalid());
        }
        let from = identities.get(&edge.from).ok_or_else(invalid)?;
        let to = identities.get(&edge.to).ok_or_else(invalid)?;
        if from == to || !pairs.insert((from.clone(), to.clone(), relation.clone())) {
            return Err(invalid());
        }
        if visible.contains(from) && visible.contains(to) {
            edges.push(GraphEdgeView {
                id: format!("edge-{index}"),
                from: from.clone(),
                to: to.clone(),
                relation,
            });
        }
    }
    Ok(GraphView {
        audience,
        nodes,
        edges,
        simulation: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill() -> Vec<fsp_domain::SkillEvidence> {
        vec![fsp_domain::SkillEvidence {
            skill_id: "rust".into(),
            status: EvidenceStatus::Evidence,
            evidence_grade: None,
            sources: vec![fsp_domain::EvidenceSource::Github],
        }]
    }

    fn graph() -> fsp_domain::ExtractedGraph {
        serde_json::from_value(serde_json::json!({
            "nodes": [
                {"id":"root-private@example.com", "kind":"role", "label":"Private Name"},
                {"id":"private-skill", "kind":"skill", "label":"Private Name", "skillId":"rust",
                    "status":"confirmed", "evidenceReferences":["skill:rust"]},
                {"id":"https://private.example", "kind":"evidence", "label":"Private repository", "evidenceReferences":["skill:rust"]}
            ],
            "edges": [
                {"id":"private-edge", "from":"root-private@example.com", "to":"private-skill", "relation":"uses", "evidenceReferences":["skill:rust"]},
                {"id":"evidence-edge", "from":"https://private.example", "to":"private-skill", "relation":"supports", "evidenceReferences":["skill:rust"]}
            ]
        })).unwrap()
    }

    #[test]
    fn employer_projection_uses_canonical_facts_and_removes_private_evidence() {
        let projected = graph_from_extracted("employer", &skill(), graph()).unwrap();
        assert_eq!(projected.nodes.len(), 2);
        assert_eq!(projected.edges.len(), 1);
        assert_eq!(projected.nodes[1].status.as_deref(), Some("evidence"));
        let output = serde_json::to_string(&projected).unwrap().to_lowercase();
        assert!(!output.contains("private"));
        assert!(!output.contains("https://"));
        assert_eq!(
            graph_from_extracted("self", &skill(), graph())
                .unwrap()
                .nodes
                .len(),
            3
        );
    }

    #[test]
    fn rejects_empty_duplicate_dangling_and_ungrounded_graphs() {
        let mut invalids = Vec::new();
        let mut empty = graph();
        empty.nodes.clear();
        invalids.push(empty);
        let mut duplicate = graph();
        duplicate.nodes[1].id = duplicate.nodes[0].id.clone();
        invalids.push(duplicate);
        let mut dangling = graph();
        dangling.edges[0].to = "missing".into();
        invalids.push(dangling);
        let mut reference = graph();
        reference.nodes[1].evidence_references = vec!["invented".into()];
        invalids.push(reference);
        let mut skill = graph();
        skill.nodes[1].skill_id = Some("invented".into());
        invalids.push(skill);
        for graph in invalids {
            assert_eq!(
                graph_from_extracted("self", &self::skill(), graph)
                    .unwrap_err()
                    .code,
                "bifrost_invalid_response"
            );
        }
    }
}
