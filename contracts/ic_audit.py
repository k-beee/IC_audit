# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class ICAudit(gl.Contract):
    owner: Address
    audit_count: i32
    audits: TreeMap[str, str]

    def __init__(self):
        # Set the contract deployer as the owner who can claim fee payouts
        self.owner = gl.message.sender_address
        self.audit_count = i32(0)

    @gl.public.write.payable
    def request_audit(self, code: str, language: str, context: str, client_time: u64) -> i32:
        # Require audit fee in GEN tokens
        value = gl.message.value
        if value == u256(0):
            raise gl.vm.UserError("Must pay audit fee")

        # Increment audit index
        self.audit_count = i32(int(self.audit_count) + 1)
        audit_id = str(int(self.audit_count))

        # Store audit request info deterministically
        audit = {
            "id": audit_id,
            "requester": str(gl.message.sender_address),
            "code": code,
            "language": language,
            "context": context,
            "fee": str(value),
            "status": 0,  # 0 = pending, 1 = completed
            "report": "",
            "created_at": int(client_time), # Set via client-provided timestamp for determinism
        }
        self.audits[audit_id] = json.dumps(audit)
        return self.audit_count
