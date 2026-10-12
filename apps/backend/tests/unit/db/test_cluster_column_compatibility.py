"""Cluster persistence retains the column names used by existing installations."""

from sqlalchemy import text

from llm_d_lens.db.dao.cluster import ClusterDao
from llm_d_lens.db.engine import get_engine


def test_benchmark_columns_support_existing_records_and_dao_updates():
    dao = ClusterDao()
    cluster = dao.create("column-compatibility", "", "", llm_d_lensmark_ref="v0.8.0")
    with get_engine().begin() as connection:
        connection.execute(
            text("UPDATE clusters SET llm_d_benchmark_repo_path = :path WHERE id = :id"),
            {"path": "/cache/benchmark", "id": cluster.id},
        )

    loaded = dao.get(cluster.id)
    assert loaded.llm_d_lensmark_ref == "v0.8.0"
    assert loaded.llm_d_lensmark_repo_path == "/cache/benchmark"
    assert dao.list()[0].to_dict()["llmDBenchmarkRepoPath"] == "/cache/benchmark"

    dao.update(cluster.id, llm_d_lensmark_ref="v0.9.0", llm_d_lensmark_repo_path=None)
    with get_engine().connect() as connection:
        values = connection.execute(
            text("SELECT llm_d_benchmark_ref, llm_d_benchmark_repo_path FROM clusters WHERE id = :id"),
            {"id": cluster.id},
        ).one()
    assert tuple(values) == ("v0.9.0", None)
