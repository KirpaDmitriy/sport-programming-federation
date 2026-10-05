from io import BytesIO

from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.main import create_app

from .helpers import authenticated_client, candidate_profile


def test_candidate_downloads_standardized_pdf_without_fsp_history(tmp_path) -> None:
    with TestClient(create_app(tmp_path / "profile-pdf.sqlite3")) as http:
        authenticated_client(http, "candidate@example.test", "candidate")
        assert http.get("/api/v1/account/profile.pdf").status_code == 409
        candidate_profile(http)
        response = http.get("/api/v1/account/profile.pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    reader = PdfReader(BytesIO(response.content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Новый кандидат" in text
    assert "Истории ФСП пока нет" in text
    assert "candidate@example.test" in text
    assert len(reader.pages) >= 1
