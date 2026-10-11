from backend.security.pii import mask, mask_text


def test_masks_email_phone_card():
    s = mask_text("mail jane.doe@example.com call +1-555-123-4567 card 4111 1111 1111 1234")
    assert "jane.doe@example.com" not in s and "j***@example.com" in s
    assert "555-123-4567" not in s
    assert "4111 1111 1111 1234" not in s and s.endswith("1234")


def test_masks_nested_structures():
    out = mask({"a": ["x@y.com", {"b": "4111111111111111"}], "n": 5})
    assert out["a"][0] == "x***@y.com" and "4111111111111111" not in out["a"][1]["b"] and out["n"] == 5


def test_leaves_ids_alone():
    assert mask_text("ORD-5002 TXN-9002 CUST-1001") == "ORD-5002 TXN-9002 CUST-1001"
