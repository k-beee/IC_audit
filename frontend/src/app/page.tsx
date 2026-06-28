"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CONTRACT_ADDRESS,
  connectWallet,
  getReadClient,
  truncateAddress,
  type WalletState,
} from "@/lib/genlayer";
import { TransactionStatus } from "genlayer-js/types";
import {
  Shield,
  ShieldAlert,
  Cpu,
  Coins,
  Code2,
  CheckCircle2,
  Clock,
  Plus,
  History,
  Sparkles,
  Wallet,
  ExternalLink,
  AlertTriangle,
  ArrowLeft,
  Play,
  Search,
  Award,
  Info,
  ChevronRight,
  UserCheck,
} from "lucide-react";

type AuditIssue = {
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  line_hint: string;
  description: string;
  fix: string;
};

type AuditReport = {
  severity: "critical" | "high" | "medium" | "low" | "clean";
  issues_count: number;
  issues: AuditIssue[];
  summary: string;
  score: number;
};

type Audit = {
  id: string;
  requester: string;
  code: string;
  language: string;
  context: string;
  fee: string;
  status: number; // 0 = pending, 1 = completed
  report: string; // JSON string representing AuditReport
  created_at: number; // unix timestamp
};

export default function Home() {
  const [wallet, setWallet] = useState<WalletState>({ address: null, client: null });
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  
  // Form states
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("Python");
  const [context, setContext] = useState("");
  const [fee, setFee] = useState("1");

  // Filter/search state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const [cursorVisible, setCursorVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const placeholderText = `# Paste your GenLayer Intelligent Contract (Python) code here...${cursorVisible ? " ▋" : ""}`;

  // Notify utility
  const showNotification = (message: string, type: "success" | "error" | "info" = "info") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Load audits from contract state
  const fetchAudits = useCallback(async () => {
    try {
      const readClient = getReadClient();
      const countResult = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_audit_count",
        args: [],
      });
      
      const count = Number(countResult);
      const fetched: Audit[] = [];
      
      for (let i = 1; i <= count; i++) {
        const rawAudit = await readClient.readContract({
          address: CONTRACT_ADDRESS,
          functionName: "get_audit",
          args: [String(i)],
        });
        
        if (rawAudit) {
          fetched.push(JSON.parse(rawAudit as string));
        }
      }
      // Sort newest first
      setAudits(fetched.reverse());
    } catch (error) {
      console.error("Error fetching audits from contract:", error);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  // Connect wallet action
  const handleConnectWallet = async () => {
    try {
      setLoading(true);
      const w = await connectWallet();
      setWallet(w);
      showNotification(`Authorized account ${truncateAddress(w.address!)}`, "success");
    } catch (error: any) {
      console.error(error);
      showNotification(error.message || "Failed to authorize wallet", "error");
    } finally {
      setLoading(false);
    }
  };

  // Request new audit write transaction
  const handleSubmitAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.client || !wallet.address) {
      showNotification("Please connect your wallet first", "error");
      return;
    }

    if (!code.trim() || !context.trim()) {
      showNotification("Please fill in all required fields", "error");
      return;
    }

    try {
      setLoading(true);
      showNotification("Submitting transaction to GenLayer Network...", "info");
      
      const feeInWei = BigInt(parseFloat(fee) * 10 ** 18);
      const clientTimestamp = BigInt(Math.floor(Date.now() / 1000));

      const hash = await wallet.client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "request_audit",
        args: [code, language, context, clientTimestamp],
        value: feeInWei,
      });

      showNotification(`Transaction submitted. Hash: ${truncateAddress(hash)}`, "info");
      
      // Wait for transaction inclusion
      await wallet.client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
      });

      showNotification("Audit requested successfully! Consensus panel initialized.", "success");
      
      // Clear form
      setCode("");
      setContext("");
      setFee("1");
      
      // Reload and switch tab
      await fetchAudits();
      setActiveTab("history");
    } catch (error: any) {
      console.error(error);
      showNotification(error.message || "Failed to submit audit", "error");
    } finally {
      setLoading(false);
    }
  };

  // Run audit trigger transaction
  const handleRunAudit = async (id: string) => {
    if (!wallet.client || !wallet.address) {
      showNotification("Wallet connection required to write transactions", "error");
      return;
    }

    try {
      setLoading(true);
      showNotification("Triggering AI Consensus audit report...", "info");

      const hash = await wallet.client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "run_audit",
        args: [id],
        value: BigInt(0),
      });

      showNotification(`Consensus transaction submitted: ${truncateAddress(hash)}`, "info");

      await wallet.client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
      });

      showNotification("AI Validator Consensus completed. Report published on-chain!", "success");
      await fetchAudits();
    } catch (error: any) {
      console.error(error);
      showNotification(error.message || "Auditing consensus failed to verify", "error");
    } finally {
      setLoading(false);
    }
  };

  // Withdraw fees (admin functionality)
  const handleWithdrawFees = async () => {
    if (!wallet.client || !wallet.address) {
      showNotification("Please connect your wallet first", "error");
      return;
    }

    const withdrawAmount = prompt("Enter amount to withdraw in GEN (e.g. 1.5):");
    if (!withdrawAmount) return;

    try {
      setLoading(true);
      showNotification("Broadcasting withdrawal request...", "info");
      const amountInWei = BigInt(parseFloat(withdrawAmount) * 10 ** 18);

      const hash = await wallet.client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "withdraw_fees",
        args: [amountInWei],
        value: BigInt(0),
      });

      showNotification("Withdrawal transaction submitted...", "info");
      await wallet.client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
      });

      showNotification("Fees successfully withdrawn to owner address", "success");
    } catch (error: any) {
      console.error(error);
      showNotification(error.message || "Withdrawal failed. Owner privileges required.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Get severity style details
  const getSeverityBadge = (sev: string) => {
    const styles = {
      critical: { bg: "bg-red-950/40 text-red-400 border-red-800", label: "Critical" },
      high: { bg: "bg-orange-950/40 text-orange-400 border-orange-800", label: "High" },
      medium: { bg: "bg-yellow-950/40 text-yellow-400 border-yellow-800", label: "Medium" },
      low: { bg: "bg-green-950/40 text-green-400 border-green-800", label: "Low" },
      clean: { bg: "bg-blue-950/40 text-blue-400 border-blue-800", label: "Clean" },
    }[sev.toLowerCase()] || { bg: "bg-gray-800 text-gray-400 border-gray-700", label: sev };
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${styles.bg}`}>
        {styles.label}
      </span>
    );
  };

  // Filter audit records based on search and dropdown selections
  const filteredAudits = audits.filter((audit) => {
    const matchesSearch =
      audit.context.toLowerCase().includes(searchQuery.toLowerCase()) ||
      audit.language.toLowerCase().includes(searchQuery.toLowerCase()) ||
      audit.id.includes(searchQuery);

    if (filterSeverity === "all") return matchesSearch;
    
    if (audit.status === 0) return filterSeverity === "pending" && matchesSearch;

    try {
      const report: AuditReport = JSON.parse(audit.report);
      return report.severity.toLowerCase() === filterSeverity.toLowerCase() && matchesSearch;
    } catch {
      return false;
    }
  });

  const selectedAudit = audits.find((a) => a.id === selectedAuditId);
  const parsedReport: AuditReport | null = selectedAudit && selectedAudit.report
    ? JSON.parse(selectedAudit.report)
    : null;

  return (
    <div className="flex-1 min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-6 right-6 z-50 max-w-sm glass-panel rounded-lg shadow-2xl border-l-4 border-l-indigo-500 overflow-hidden animate-slide-in">
          <div className="p-4 flex items-start space-x-3">
            <Info className={`w-5 h-5 flex-shrink-0 ${
              notification.type === "success" ? "text-emerald-400" :
              notification.type === "error" ? "text-red-400" : "text-indigo-400"
            }`} />
            <div>
              <p className="text-sm font-semibold text-white">System Alert</p>
              <p className="text-xs mt-1 text-gray-300 leading-relaxed">{notification.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="glass-panel p-8 rounded-2xl max-w-sm w-full border border-gray-800 text-center flex flex-col items-center shadow-2xl">
            <div className="w-14 h-14 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin flex items-center justify-center mb-5">
              <Cpu className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Processing on GenLayer</h3>
            <p className="text-xs text-gray-400 leading-relaxed max-w-xs mb-5">
              Awaiting block confirmation. Please confirm in your wallet. AI validator consensus runs immediately on transaction finalization.
            </p>
            <div className="flex items-center space-x-2 text-[10px] text-indigo-400 font-semibold bg-indigo-950/30 px-3 py-1.5 rounded-full border border-indigo-800/30">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
              <span>Awaiting receipt...</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Header */}
      <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
                IC Audit
              </span>
              <span className="block text-[10px] text-gray-500 tracking-wider uppercase font-semibold">
                AI Consensus Platform
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {wallet.address && (
              <button
                onClick={handleWithdrawFees}
                className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs border border-gray-800 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
              >
                Owner Panel
              </button>
            )}
            <button
              onClick={handleConnectWallet}
              disabled={loading}
              className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold shadow transition-all duration-200 ${
                wallet.address
                  ? "bg-gray-800 text-emerald-400 hover:bg-gray-700 hover:text-emerald-300 border border-emerald-500/25"
                  : "bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-indigo-500/10 active:scale-95"
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>{wallet.address ? truncateAddress(wallet.address) : "Connect Wallet"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8">
        
        {/* Left Side: Forms and Lists */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          
          {/* Dashboard Navigation Tabs */}
          <div className="flex bg-gray-900/60 p-1.5 rounded-xl border border-gray-800 self-start">
            <button
              onClick={() => {
                setActiveTab("submit");
                setSelectedAuditId(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "submit" && !selectedAuditId
                  ? "bg-gray-800 text-indigo-400 shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Request Review</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("history");
                setSelectedAuditId(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "history" && !selectedAuditId
                  ? "bg-gray-800 text-indigo-400 shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <History className="w-4 h-4" />
              <span>Audit History</span>
            </button>
          </div>

          {/* Core App View */}
          {selectedAuditId && selectedAudit ? (
            /* Tab: Detail view */
            <div className="glass-card rounded-2xl p-6 relative overflow-hidden w-full min-w-0">
              <button
                onClick={() => setSelectedAuditId(null)}
                className="inline-flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mb-6 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to List</span>
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800/80 pb-6 mb-6">
                <div>
                  <div className="flex items-center space-x-3">
                    <span className="text-gray-500 text-xs font-mono">ID: #{String(selectedAudit.id).padStart(3, "0")}</span>
                    <span className="bg-gray-800/60 px-2 py-0.5 rounded text-xs text-gray-400 border border-gray-700">{selectedAudit.language}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white mt-1.5 leading-snug">{selectedAudit.context}</h2>
                </div>
                <div className="flex items-center space-x-2">
                  {selectedAudit.status === 0 ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/40 text-amber-400 border border-amber-800">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      Queued
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Audited
                    </span>
                  )}
                </div>
              </div>

              {/* Submitted Code snippet */}
              <div className="mb-6 w-full overflow-hidden">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                  <Code2 className="w-4 h-4 mr-1.5 text-indigo-400" />
                  Audit Target Code
                </h3>
                <pre className="w-full overflow-x-auto bg-gray-950 border border-gray-800 rounded-xl p-4 max-h-64 text-xs font-mono text-emerald-400/90 leading-relaxed leading-5">
                  <code>{selectedAudit.code}</code>
                </pre>
              </div>

              {/* Status specific panel */}
              {selectedAudit.status === 0 ? (
                <div className="bg-gray-900/50 rounded-xl border border-gray-800/80 p-6 text-center">
                  <Cpu className="w-10 h-10 text-amber-400/80 mx-auto mb-3 animate-pulse" />
                  <h4 className="text-white font-bold mb-1.5">Audit Queue Initialized</h4>
                  <p className="text-xs text-gray-400 max-w-md mx-auto mb-4">
                    The transaction was registered on-chain. Trigger the independent validation panel to let GenLayer AI nodes vote on vulnerabilities.
                  </p>
                  <button
                    onClick={() => handleRunAudit(selectedAudit.id)}
                    disabled={loading}
                    className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl shadow-lg hover:shadow-indigo-500/10 active:scale-95 transition"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run AI Consensus Audit</span>
                  </button>
                </div>
              ) : parsedReport ? (
                <div className="space-y-6">
                  {/* Consensus report details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-800 text-center">
                      <span className="block text-[10px] text-gray-500 uppercase font-semibold">Consensus Verdict</span>
                      <div className="mt-1">{getSeverityBadge(parsedReport.severity)}</div>
                    </div>
                    <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-800 text-center">
                      <span className="block text-[10px] text-gray-500 uppercase font-semibold">Security Score</span>
                      <span className={`block text-2xl font-black mt-1 ${
                        parsedReport.score >= 8 ? "text-emerald-400" :
                        parsedReport.score >= 5 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {parsedReport.score}/10
                      </span>
                    </div>
                    <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-800 text-center">
                      <span className="block text-[10px] text-gray-500 uppercase font-semibold">Issues Detected</span>
                      <span className="block text-2xl font-black text-white mt-1">{parsedReport.issues_count}</span>
                    </div>
                  </div>

                  <div className="bg-gray-900/20 p-4 rounded-xl border border-gray-800/80">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Executive Summary</h4>
                    <p className="text-sm text-gray-300 leading-relaxed">{parsedReport.summary}</p>
                  </div>

                  {/* Findings list */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Security Findings & Recommendations</h4>
                    {parsedReport.issues && parsedReport.issues.length > 0 ? (
                      <div className="space-y-3">
                        {parsedReport.issues.map((issue, idx) => (
                          <div key={idx} className="bg-gray-950 border border-gray-800/80 rounded-xl p-4 border-l-4 border-l-purple-500">
                            <div className="flex items-center justify-between gap-4 mb-2">
                              <h5 className="font-bold text-white text-sm">{issue.title}</h5>
                              <div className="flex items-center space-x-2">
                                <span className="text-[10px] text-gray-500 font-mono">Lines: {issue.line_hint}</span>
                                {getSeverityBadge(issue.severity)}
                              </div>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed mb-3">{issue.description}</p>
                            <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800">
                              <div className="text-[10px] text-emerald-500 font-semibold mb-1 uppercase tracking-wider">Recommended Fix</div>
                              <code className="text-xs text-emerald-400 block break-all font-mono">{issue.fix}</code>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-gray-900/30 p-6 rounded-xl border border-gray-800 text-center text-xs text-gray-400">
                        No significant vulnerabilities identified. Safe to deploy!
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-xs text-red-400">Report details failed to parse.</div>
              )}
            </div>
          ) : activeTab === "submit" ? (
            /* Tab: Submit Audit request */
            <form onSubmit={handleSubmitAudit} className="glass-card rounded-2xl p-6 w-full min-w-0">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2 mb-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <span>Submit New Review Request</span>
              </h2>
              <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                Provide contract source code and context. Decentralized AI validators will execute parallel reviews and compile a consensus security audit report.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contract Language</label>
                  <div className="w-full rounded-xl px-4 py-2.5 text-xs glass-input font-medium bg-gray-950/80 text-indigo-400 border border-gray-800/80 flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    <span>Intelligent Contract (Python)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contract Source Code</label>
                  <div className="border border-gray-800 rounded-xl overflow-hidden shadow-lg shadow-black/50">
                    {/* Mock Terminal Header */}
                    <div className="bg-gray-900/90 px-4 py-2 border-b border-gray-800/80 flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 block" />
                      </div>
                      <div className="text-[10px] font-mono text-gray-500 flex items-center space-x-1">
                        <Code2 className="w-3 h-3 text-indigo-400" />
                        <span>terminal // source_code.py</span>
                      </div>
                      <div className="w-12" />
                    </div>
                    {/* Textarea inside terminal */}
                    <textarea
                      placeholder={placeholderText}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      rows={12}
                      className="w-full bg-black/95 text-emerald-400 font-mono text-xs p-4 focus:ring-0 focus:outline-none resize-none border-0 leading-relaxed block shadow-inner placeholder-emerald-500/45"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Functional Context</label>
                  <input
                    type="text"
                    placeholder="E.g., ERC-20 token with governance voting; requires custom staking rules..."
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    required
                    className="w-full rounded-xl px-4 py-2.5 text-xs glass-input"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Audit Fee (GEN)</label>
                    <div className="relative">
                      <Coins className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="1"
                        value={fee}
                        onChange={(e) => setFee(e.target.value)}
                        required
                        className="w-full rounded-xl pl-10 pr-4 py-2.5 text-xs glass-input"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-end">
                    <button
                      type="submit"
                      disabled={loading || !wallet.address}
                      className="w-full inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl shadow hover:shadow-indigo-500/10 disabled:opacity-40 disabled:hover:bg-indigo-600 active:scale-[0.98] transition-all"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Submit Audit Transaction</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          ) : (
            /* Tab: Audit History list */
            <div className="space-y-4">
              {/* Search and Filters */}
              <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search audits..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl pl-9 pr-4 py-1.5 text-xs glass-input"
                  />
                </div>
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-xs text-gray-500 whitespace-nowrap">Filter Severity:</span>
                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="w-full sm:w-auto rounded-xl px-3 py-1.5 text-xs glass-input font-medium"
                  >
                    <option value="all">All</option>
                    <option value="pending">Queued</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="clean">Clean</option>
                  </select>
                </div>
              </div>

              {/* History list */}
              {filteredAudits.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center border border-gray-800">
                  <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <h4 className="text-white font-bold mb-1">No Audit Reports Found</h4>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Try adjusting your filters or submit a new review request to populate the list.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredAudits.map((audit) => {
                    const report: AuditReport | null = audit.report ? JSON.parse(audit.report) : null;
                    return (
                      <div
                        key={audit.id}
                        onClick={() => {
                          setSelectedAuditId(audit.id);
                        }}
                        className="glass-card rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-indigo-500/40"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] text-gray-500 font-mono">ID: #{String(audit.id).padStart(3, "0")}</span>
                            <span className="bg-gray-800/80 px-2 py-0.25 rounded text-[10px] text-gray-400 border border-gray-700 font-mono">
                              {audit.language}
                            </span>
                          </div>
                          <h3 className="font-bold text-white text-sm truncate mt-1">{audit.context}</h3>
                          <span className="text-[10px] text-gray-500 mt-1 block truncate">
                            Requester: {truncateAddress(audit.requester)}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-3 flex-shrink-0">
                          {audit.status === 0 ? (
                            <span className="bg-amber-950/20 border border-amber-800 text-amber-500 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>Queued</span>
                            </span>
                          ) : report ? (
                            <div className="flex items-center space-x-2">
                              <span className={`text-xs font-bold ${
                                report.score >= 8 ? "text-emerald-400" :
                                report.score >= 5 ? "text-yellow-400" : "text-red-400"
                              }`}>
                                {report.score}/10
                              </span>
                              {getSeverityBadge(report.severity)}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">Processed</span>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Platform Information and Stats */}
        <div className="w-full md:w-80 flex flex-col gap-6 flex-shrink-0">
          {/* Stats Summary Widget */}
          <div className="glass-card rounded-2xl p-5 border border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
              <Award className="w-4 h-4 mr-1.5 text-indigo-400" />
              Platform Statistics
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
                <span className="text-xs text-gray-400">Total Audits</span>
                <span className="text-sm font-bold text-white">{audits.length}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
                <span className="text-xs text-gray-400">Security Score Avg</span>
                <span className="text-sm font-bold text-indigo-400">
                  {(() => {
                    const completed = audits.filter(a => a.status === 1 && a.report);
                    if (completed.length === 0) return "N/A";
                    const total = completed.reduce((acc, curr) => {
                      try {
                        const r: AuditReport = JSON.parse(curr.report);
                        return acc + r.score;
                      } catch {
                        return acc;
                      }
                    }, 0);
                    return `${(total / completed.length).toFixed(1)}/10`;
                  })()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Pending Execution</span>
                <span className="text-sm font-bold text-amber-400">
                  {audits.filter((a) => a.status === 0).length}
                </span>
              </div>
            </div>
          </div>

          {/* Educational panel about GenLayer and Consensus */}
          <div className="glass-panel rounded-2xl p-5 border border-gray-800/60">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center">
              <Info className="w-4 h-4 mr-1.5 text-indigo-400" />
              Why GenLayer Consensus?
            </h2>
            <div className="text-xs text-gray-400 space-y-3 leading-relaxed">
              <p>
                Standard blockchains cannot run AI models directly because they are non-deterministic. Traditional off-chain AI audits depend on a single model run, which can hallucinate or fail.
              </p>
              <div className="flex items-start space-x-2 mt-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                <p>
                  <strong>Independent Judgments:</strong> Multiple GenLayer validator nodes process the contract separately.
                </p>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                <p>
                  <strong>Equivalence Matching:</strong> Reports are accepted only if validator nodes reach agreement on rating limits.
                </p>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                <p>
                  <strong>Immutable History:</strong> Verified reports are saved directly in state, guaranteeing verifiability.
                </p>
              </div>
            </div>
          </div>

          {/* Contract Address and Explorer link */}
          <div className="glass-card rounded-2xl p-4 flex flex-col gap-2 border border-gray-800 text-center">
            <span className="block text-[10px] text-gray-500 uppercase tracking-wider">Intelligent Contract Address</span>
            <code className="text-xs text-indigo-400 font-mono break-all font-semibold select-all">
              {CONTRACT_ADDRESS}
            </code>
            <a
              href={`https://genlayer-explorer.vercel.app/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center space-x-1 text-[10px] text-gray-500 hover:text-white transition mt-1.5"
            >
              <span>Explore on GenLayer Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-900 bg-gray-950 py-8 text-center text-xs text-gray-600">
        <p className="max-w-2xl mx-auto px-4 leading-relaxed">
          IC Audit leverages the GenLayer Decentralized Virtual Machine (GenVM) to resolve multi-agent AI reviews on-chain.
        </p>
        <p className="mt-2 text-[10px] text-gray-700">© 2026 IC Audit. Powered by GenLayer Network.</p>
      </footer>
    </div>
  );
}
