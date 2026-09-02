"use client";

import { useState, useEffect } from "react";
import { Key, X, Check, Eye, EyeOff } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeySettingsModal({ isOpen, onClose }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.aimlapi.com/v1");
  const [model, setModel] = useState("meta/muse-spark-1.2");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("smp_muse_spark_api_key") || "");
      setBaseUrl(localStorage.getItem("smp_muse_spark_base_url") || "https://api.aimlapi.com/v1");
      setModel(localStorage.getItem("smp_muse_spark_model") || "meta/muse-spark-1.2");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem("smp_muse_spark_api_key", apiKey.trim());
    localStorage.setItem("smp_muse_spark_base_url", baseUrl.trim());
    localStorage.setItem("smp_muse_spark_model", model.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const handleClear = () => {
    localStorage.removeItem("smp_muse_spark_api_key");
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl max-w-md w-full p-6 text-[var(--fg)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[var(--acc)]" />
            <h3 className="font-bold text-lg">Muse Spark API Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--sub)] hover:text-[var(--fg)] p-1 rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[var(--sub)] mb-4 leading-relaxed">
          Your API key is securely stored only in your local browser storage (`localStorage`) and is never sent to any server except direct HTTPS requests to the LLM endpoint for autofill.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--sub)] mb-1 uppercase tracking-wider">
              API Token
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API token..."
                className="w-full px-3 py-2 pr-10 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--acc)]"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 text-[var(--sub)] hover:text-[var(--fg)]"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--sub)] mb-1 uppercase tracking-wider">
              Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.aimlapi.com/v1"
              className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--acc)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--sub)] mb-1 uppercase tracking-wider">
              Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="meta/muse-spark-1.2"
              className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--acc)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-5 mt-5 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-[var(--sub)] hover:text-rose-500 transition"
          >
            Clear Key
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-[var(--sub)] hover:text-[var(--fg)] bg-[var(--bg)] border border-[var(--border)] rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[var(--acc)] hover:opacity-90 rounded-lg transition"
            >
              {saved ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Saved
                </>
              ) : (
                "Save Configuration"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
