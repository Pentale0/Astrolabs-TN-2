import { useEffect, useState } from 'react';
import { Copy, Download, Check } from 'lucide-react';
import { vigilApi } from '../api/client.ts';
import type { ReportResponse } from '../shared/types.ts';

interface ReportViewProps {
  crewId: string;
  refreshKey: number;
}

export function ReportView({ crewId, refreshKey }: ReportViewProps) {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    vigilApi
      .getReport(crewId)
      .then((res) => {
        if (active) setReport(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [crewId, refreshKey]);

  const handleCopy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([report.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigil-report-${report.crew_id}-${report.generated_at.slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-8 text-center text-sm text-slate-400">
        Generating Flight Surgeon medical packet...
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#0E1522] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Flight Surgeon Transmission Packet
          </h2>
          <p className="text-xs text-slate-400">
            Plain-ASCII formatted medical summary · Generated {report.generated_at}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Text'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-md bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download .txt</span>
          </button>
        </div>
      </div>

      <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0A0F1A] p-5 font-mono text-xs leading-relaxed text-slate-200">
        {report.text}
      </pre>
    </div>
  );
}
