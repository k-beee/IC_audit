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
