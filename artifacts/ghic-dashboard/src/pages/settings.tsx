import React, { useState } from 'react';
import { useGetSettings, getGetSettingsQueryKey, useUpdateSettings } from "@workspace/api-client-react";
import { PageHeader, PageContent, FeatureUnavailable } from "@/components/ui/swiss";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  
  const [activeTab, setActiveTab] = useState('general');
  const tabs = ['general', 'intelligence', 'automation', 'providers', 'api-keys', 'danger-zone'];

  const update = useUpdateSettings({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
    }
  });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Settings" description="Platform configuration and preferences">
        <button 
          className="px-6 py-2 bg-primary text-primary-foreground font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-2"
          disabled={update.isPending}
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </PageHeader>
      <div className="px-6 pt-6">
        <FeatureUnavailable reason="GHIC is configured with environment variables, not through this dashboard. Changes here are not persisted." />
      </div>
      
      {/* Tabs */}
      <div className="px-8 border-b border-border bg-card overflow-x-auto scrollbar-none">
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs font-display tracking-widest uppercase font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab 
                  ? tab === 'danger-zone' ? 'border-destructive text-destructive' : 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      <PageContent className="max-w-4xl">
        {isLoading ? (
          <div className="h-64 bg-muted animate-pulse border border-border" />
        ) : settings ? (
          <div className="border border-border bg-card p-8">
            <h2 className="text-xl font-display font-bold tracking-wide uppercase mb-6">{activeTab.replace('-', ' ')} Settings</h2>
            
            {activeTab === 'general' && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-display uppercase tracking-widest font-bold">Organization Name</label>
                  <input type="text" defaultValue={settings.general.organizationName} className="p-3 bg-muted/30 border border-border font-mono text-sm focus:outline-none focus:border-primary transition-colors" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-display uppercase tracking-widest font-bold">Default Branch</label>
                  <input type="text" defaultValue={settings.general.defaultBranch} className="p-3 bg-muted/30 border border-border font-mono text-sm focus:outline-none focus:border-primary transition-colors" />
                </div>
              </div>
            )}

            {activeTab === 'providers' && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-display uppercase tracking-widest font-bold">LLM Provider</label>
                  <select defaultValue={settings.llmProvider} className="p-3 bg-muted/30 border border-border font-mono text-sm focus:outline-none focus:border-primary transition-colors appearance-none">
                    <option value="openai">OpenAI (GPT-4)</option>
                    <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                    <option value="google">Google (Gemini 1.5 Pro)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-display uppercase tracking-widest font-bold">Embedding Provider</label>
                  <select defaultValue={settings.embeddingProvider} className="p-3 bg-muted/30 border border-border font-mono text-sm focus:outline-none focus:border-primary transition-colors appearance-none">
                    <option value="openai">OpenAI (text-embedding-3-large)</option>
                    <option value="cohere">Cohere (embed-english-v3)</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'intelligence' && (
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-3 p-4 border border-border cursor-pointer hover:bg-muted/10 transition-colors">
                  <input type="checkbox" defaultChecked={settings.repositoryIntelligenceEnabled} className="w-4 h-4 accent-primary" />
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">Repository Intelligence</span>
                    <span className="text-xs text-muted-foreground">Automatically index and analyze repository structure</span>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-4 border border-border cursor-pointer hover:bg-muted/10 transition-colors">
                  <input type="checkbox" defaultChecked={settings.engineeringIntelligenceEnabled} className="w-4 h-4 accent-primary" />
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">Engineering Intelligence</span>
                    <span className="text-xs text-muted-foreground">Analyze issues, PRs, and regressions</span>
                  </div>
                </label>
              </div>
            )}
            
            {activeTab === 'danger-zone' && (
              <div className="flex flex-col gap-4 border border-destructive p-6 bg-destructive/5">
                <h3 className="text-destructive font-bold">Danger Zone</h3>
                <p className="text-sm text-muted-foreground">These actions are destructive and cannot be undone.</p>
                <div className="pt-4">
                  <button className="px-6 py-2 bg-destructive text-destructive-foreground font-display tracking-widest uppercase text-xs font-bold hover:bg-destructive/90 transition-colors">
                    Delete Organization
                  </button>
                </div>
              </div>
            )}

            {!['general', 'providers', 'intelligence', 'danger-zone'].includes(activeTab) && (
              <p className="text-muted-foreground text-sm">Configure {activeTab.replace('-', ' ')} settings here.</p>
            )}
          </div>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">Failed to load settings.</div>
        )}
      </PageContent>
    </div>
  );
}
