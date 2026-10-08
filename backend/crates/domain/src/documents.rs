use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct PdfPage {
    pub page: u16,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResumeExtraction {
    pub fields: Vec<ResumeField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResumeField {
    pub field: String,
    pub value: String,
    pub page: u16,
    pub quote: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportEvidence {
    pub field: String,
    pub page: u16,
    pub quote: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentHelpRequest {
    pub task: crate::AssessmentTask,
    pub answer: crate::AssessmentAnswer,
    pub question: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssessmentHelpReply {
    pub message: String,
}
