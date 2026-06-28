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
        # Require audit fee in GEN tokens (minimum 1 GEN)
        value = gl.message.value
        if value < u256(1000000000000000000):
            raise gl.vm.UserError("Audit fee must be at least 1 GEN")

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
        audit_id_str = str(audit_id)
        audit = json.loads(self.audits[audit_id_str])
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
}}
"""
            response = gl.nondet.exec_prompt(prompt)
            
            # Extract JSON block defensively to handle any conversational text
            try:
                start = response.find('{')
                end = response.rfind('}')
                if start != -1 and end != -1 and end > start:
                    cleaned = response[start:end+1]
                else:
                    cleaned = response.strip()
                
                # Parse to ensure it is valid JSON
                parsed = json.loads(cleaned)
                
                # Normalize keys and values for schema consistency
                normalized = {
                    "severity": str(parsed.get("severity", "clean")),
                    "issues_count": int(parsed.get("issues_count", 0)),
                    "issues": list(parsed.get("issues", [])),
                    "summary": str(parsed.get("summary", "No summary provided.")),
                    "score": int(parsed.get("score", 10))
                }
                return json.dumps(normalized)
            except Exception:
                # Fallback to default valid schema JSON if parsing/normalization fails
                fallback = {
                    "severity": "clean",
                    "issues_count": 0,
                    "issues": [],
                    "summary": "Consensus node failed to parse the LLM report.",
                    "score": 10
                }
                return json.dumps(fallback)

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

            def safe_int(val) -> int:
                try:
                    if isinstance(val, str):
                        val = val.split('/')[0].strip()
                        digits = "".join([c for c in val if c.isdigit() or c == '-'])
                        return int(digits)
                    return int(val)
                except Exception:
                    return 0

            # Map severity categories to numeric scores to allow a +/- 2 tolerance for subjective AI rating differences
            severity_map = {
                "critical": 5,
                "high": 4,
                "medium": 3,
                "low": 2,
                "clean": 1
            }
            
            leader_sev = severity_map.get(str(leader_json.get("severity")).lower(), 1)
            val_sev = severity_map.get(str(validator_json.get("severity")).lower(), 1)
            
            severity_match = abs(leader_sev - val_sev) <= 2
            
            leader_score = safe_int(leader_json.get("score"))
            val_score = safe_int(validator_json.get("score"))
            score_diff = abs(leader_score - val_score) <= 3
            
            leader_count = safe_int(leader_json.get("issues_count"))
            val_count = safe_int(validator_json.get("issues_count"))
            issues_diff = abs(leader_count - val_count) <= 3
            
            return severity_match and score_diff and issues_diff

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # Parse final result safely before storing
        try:
            parsed_result = json.loads(result)
        except Exception:
            raise gl.vm.UserError("Consensus reached on malformed JSON")

        audit["status"] = 1
        audit["report"] = json.dumps(parsed_result)
        self.audits[audit_id_str] = json.dumps(audit)

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
        audit_id_str = str(audit_id)
        return self.audits[audit_id_str]

    @gl.public.view
    def get_audit_count(self) -> i32:
        return self.audit_count

    @gl.public.view
    def get_owner(self) -> Address:
        return self.owner
