import pytest

from backend.tools.sql_guard import SQLRejected, validate_select

REJECT = [
    "DELETE FROM orders",
    "UPDATE orders SET status='CONFIRMED'",
    "INSERT INTO orders (id) VALUES ('x')",
    "DROP TABLE orders",
    "TRUNCATE orders",
    "ALTER TABLE orders ADD COLUMN x int",
    "CREATE TABLE x (id int)",
    "GRANT ALL ON orders TO public",
    "SELECT * FROM users",
    "SELECT * FROM audit_log",
    "SELECT * FROM orders; DELETE FROM orders",
    "SELECT * FROM pg_catalog.pg_roles",
    "SELECT pg_sleep(10) FROM orders",
    "WITH x AS (DELETE FROM orders RETURNING *) SELECT * FROM x",
    "SELECT * INTO new_table FROM orders",
    "COPY orders TO '/tmp/x'",
    "select id from orders union select password_hash from users",
]


@pytest.mark.parametrize("sql", REJECT)
def test_rejects_non_select_and_disallowed(sql):
    with pytest.raises(SQLRejected):
        validate_select(sql)


def test_allows_select_and_adds_limit():
    out = validate_select("SELECT id, status FROM orders WHERE customer_id = 'CUST-1001'")
    assert out.upper().startswith("SELECT") and "LIMIT 100" in out.upper()


def test_caps_large_limit():
    assert "LIMIT 100" in validate_select("SELECT * FROM payments LIMIT 100000").upper()


def test_keeps_small_limit_and_joins():
    out = validate_select("SELECT o.id FROM orders o JOIN payments p ON p.order_id = o.id LIMIT 5")
    assert "LIMIT 5" in out.upper()
