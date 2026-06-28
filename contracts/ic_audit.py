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

    @gl.public.write
    def run_audit(self, audit_id: str) -> None:
        audit = json.loads(self.audits[audit_id])
        if audit["status"] != 0:
            raise gl.vm.UserError("Audit already processed")

        code = audit["code"]
        language = audit["language"]
        context = audit["context"]

        def leader_fn() -> str:
            prompt = f"""You are an expert smart contract security auditor and senior Intelligent Contract engineer.
Analyze the following code for vulnerabilities, logic bugs, gas issues, and GenLayer/GenVM specific safety violations.

LANGUAGE: {language}
CONTEXT: {context}

CODE:
{code}

Analyze strictly for:
1. Security vulnerabilities (reentrancy, overflow, access control, frontrunning, missing validations)
2. Logic bugs (incorrect logic gates, comparison operators, math overflow, edge case handling, off-by-one errors)
3. Gas / execution efficiency (wasteful loops, duplicate state reads, storage layout optimizations)
4. GenLayer / GenVM safety guidelines (no non-deterministic calls like time/random, direct OS/subprocesses imports, incorrect storage usage - e.g. using standard lists/dicts instead of TreeMap/DynArray, improper use of run_nondet_unsafe)
5. Best practice violations (proper comments, variable names, modular design, event logging)

You MUST respond strictly with a valid JSON object matching the schema below:
{{
    "severity": "critical" or "high" or "medium" or "low" or "clean",
    "issues_count": number,
    "issues": [
        {{"title": "issue title", "severity": "critical/high/medium/low", "line_hint": "approximate line numbers", "description": "detailed issue explanation", "fix": "detailed code fix suggestion"}}
    ],
    "summary": "overall summary of findings",
    "score": 1-10 (10 = perfectly secure and optimal)
}}"""
            response = gl.nondet.exec_prompt(prompt)
            # Remove markdown JSON fences if the LLM output includes them
            cleaned = response.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
            return cleaned

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            
            try:
                leader_json = json.loads(leader_result.calldata)
            except Exception:
                return False
                
            try:
                validator_res = leader_fn()
                validator_json = json.loads(validator_res)
            except Exception:
                return False

            required_keys = ["severity", "issues_count", "score"]
            if not all(k in leader_json for k in required_keys) or not all(k in validator_json for k in required_keys):
                return False

            # Check if severity levels match, scores are within +/- 2, issues_count within +/- 1
            severity_match = leader_json["severity"] == validator_json["severity"]
            score_diff = abs(int(leader_json["score"]) - int(validator_json["score"])) <= 2
            issues_diff = abs(int(leader_json["issues_count"]) - int(validator_json["issues_count"])) <= 1
            
            return severity_match and score_diff and issues_diff

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # Parse final result safely before storing
        try:
            parsed_result = json.loads(result)
        except Exception:
            raise gl.vm.UserError("Consensus reached on malformed JSON")

        audit["status"] = 1
        audit["report"] = json.dumps(parsed_result)
        self.audits[audit_id] = json.dumps(audit)

    @gl.public.write
    def withdraw_fees(self, amount: u256) -> None:
        # Restrict access to the contract deployer (owner)
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only owner can withdraw fees")
        
        # Send GEN tokens to the owner's address
        @gl.evm.contract_interface
        class _OwnerRecipient:
            class View:
                pass
            class Write:
                pass
        _OwnerRecipient(self.owner).emit_transfer(value=amount)

    @gl.public.view
    def get_audit(self, audit_id: str) -> str:
        return self.audits[audit_id]

    @gl.public.view
    def get_audit_count(self) -> i32:
        return self.audit_count
