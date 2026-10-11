"""SQL safety for query_orders_db (FR-5): parse, don't string-match."""
import sqlglot
from sqlglot import exp

from backend.database.models import DEMO_TABLES

ROW_LIMIT = 100
_FORBIDDEN = (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Alter, exp.Command,
              exp.Merge, exp.TruncateTable, exp.Into, exp.Lock)


class SQLRejected(ValueError):
    pass


def validate_select(sql: str) -> str:
    """Return a safe, LIMIT-bounded SELECT, or raise SQLRejected."""
    try:
        statements = [s for s in sqlglot.parse(sql, read="postgres") if s is not None]
    except sqlglot.errors.ParseError as e:
        raise SQLRejected(f"unparseable SQL: {str(e)[:120]}")
    if len(statements) != 1:
        raise SQLRejected("exactly one statement is allowed")
    tree = statements[0]
    if not isinstance(tree, exp.Select):
        raise SQLRejected(f"only SELECT is allowed, got {type(tree).__name__}")
    if tree.find(*_FORBIDDEN):
        raise SQLRejected("statement contains a forbidden clause")
    cte_names = {c.alias_or_name for c in tree.find_all(exp.CTE)}
    for t in tree.find_all(exp.Table):
        name = t.name.lower()
        if t.db or t.catalog:
            raise SQLRejected("schema-qualified tables are not allowed")
        if name not in DEMO_TABLES and name not in cte_names:
            raise SQLRejected(f"table not allowed: {name}")
    for f in tree.find_all(exp.Anonymous):
        if f.name.lower().startswith(("pg_", "set_config", "lo_", "dblink")):
            raise SQLRejected(f"function not allowed: {f.name}")
    limit = tree.args.get("limit")
    if limit is None:
        tree = tree.limit(ROW_LIMIT)
    else:
        try:
            if int(limit.expression.name) > ROW_LIMIT:
                tree = tree.limit(ROW_LIMIT)
        except (ValueError, AttributeError):
            tree = tree.limit(ROW_LIMIT)
    return tree.sql(dialect="postgres")
