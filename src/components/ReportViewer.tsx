import React, { useState } from 'react';
import { Copy, Check, Download, X } from 'lucide-react';

interface ReportViewerProps {
  reportA: string;
  reportB: string;
  onClose: () => void;
}

const ReportViewer: React.FC<ReportViewerProps> = ({ reportA, reportB, onClose }) => {
  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = activeTab === 'A' ? reportA : reportB;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden scale-in-95">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="font-semibold text-gray-800">生成報告回顧</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button 
            onClick={() => setActiveTab('A')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'A' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--primary-light)]' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            校方行動申請表 (Format A)
          </button>
          <button 
            onClick={() => setActiveTab('B')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'B' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--primary-light)]' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            家長行動小貼士 (Format B)
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
            {activeTab === 'A' ? reportA : reportB}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-opacity-90 transition-all active:scale-95"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? '已複製' : '複製內容'}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition-all">
            <Download size={16} /> 下載 PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportViewer;
