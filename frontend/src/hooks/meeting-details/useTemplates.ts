import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke as invokeTauri } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import Analytics from '@/lib/analytics';
import type { TemplateInfo } from '@/lib/summary-templates';

export function useTemplates() {
  const [availableTemplates, setAvailableTemplates] = useState<TemplateInfo[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('standard_meeting');
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const refreshVersion = useRef(0);
  const refreshTemplates = useCallback(async () => {
    const version = ++refreshVersion.current;
    setIsTemplatesLoading(true);
    try {
      const templates = await invokeTauri<TemplateInfo[]>('api_list_templates');
      if (version !== refreshVersion.current) return;
      setAvailableTemplates(templates);
      setSelectedTemplate(current => templates.some(t => t.id === current)
        ? current : templates.find(t => t.id === 'standard_meeting')?.id ?? templates[0]?.id ?? 'standard_meeting');
      setTemplatesError(null);
    } catch (error) {
      if (version === refreshVersion.current) setTemplatesError(String(error));
      throw error;
    } finally {
      if (version === refreshVersion.current) setIsTemplatesLoading(false);
    }
  }, []);

  // Fetch available templates on mount
  useEffect(() => {
    void refreshTemplates().catch(() => {});
    return () => { refreshVersion.current += 1; };
  }, [refreshTemplates]);

  // Handle template selection
  const handleTemplateSelection = useCallback((templateId: string, templateName: string) => {
    setSelectedTemplate(templateId);
    toast.success('Template selected', {
      description: `Using "${templateName}" template for summary generation`,
    });
    Analytics.trackFeatureUsed('template_selected');
  }, []);

  return {
    availableTemplates,
    selectedTemplate,
    handleTemplateSelection,
    refreshTemplates,
    templatesError,
    isTemplatesLoading,
  };
}
