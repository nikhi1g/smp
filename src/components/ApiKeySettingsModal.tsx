"use client";

import { useState, useEffect } from "react";
import { Key, X, Check, Eye, EyeOff } from "lucide-react";
import { DEFAULT_MODEL } from "@/lib/autofill";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeySettingsModal({ isOpen, onClose }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("smp_openrouter_api_key") || "");
      setModel(localStorage.getItem("smp_openrouter_model") || DEFAULT_MODEL);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem("smp_openrouter_api_key", apiKey.trim());
    localStorage.setItem("smp_openrouter_model", model.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const handleClear = () => {
    localStorage.removeItem("smp_openrouter_api_key");
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
            <h3 className="font-bold text-lg">OpenRouter API Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--sub)] hover:text-[var(--fg)] p-1 rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[var(--sub)] mb-4 leading-relaxed">
          Your OpenRouter API token is stored securely in your browser&apos;s local storage (`localStorage`) and sent via HTTPS directly to `openrouter.ai/api/v1` for structured schema autofill.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--sub)] mb-1 uppercase tracking-wider">
              OpenRouter API Key
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
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
              Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODEL}
              className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--acc)]"
            />
            <p className="text-[11px] text-[var(--sub)] mt-1">
              Supports `meta-llama/llama-3.3-70b-instruct`, `anthropic/claude-3.5-sonnet`, `openai/gpt-4o-mini`, etc.
            </p>
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
