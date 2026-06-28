import sys
import os
# Add root path to sys.path so we can import the contract
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_contract_compiles():
    try:
        # Mock global gl object matching GenLayer decorator layout
        class MockGL:
            class Contract:
                pass
            class Public:
                class Write:
                    def payable(self, x): return x
                    def __call__(self, x): return x
                write = Write()
                def view(self, x): return x
            public = Public()
            class vm:
                class UserError(Exception):
                    pass
                class Return:
                    pass
        import builtins
        builtins.gl = MockGL()
        builtins.TreeMap = dict
        builtins.i32 = int
        builtins.u256 = int
        builtins.u64 = int
        builtins.Address = str

        from contracts.ic_audit import ICAudit
        print("✓ ICAudit contract imported successfully!")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"✗ Failed to import contract: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_contract_compiles()
