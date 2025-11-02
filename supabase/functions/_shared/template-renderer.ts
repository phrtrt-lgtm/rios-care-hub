/**
 * Simple template rendering utility
 * Supports {{variable}} and {{#if variable}}...{{/if}} syntax
 */

export function renderTemplate(template: string, variables: Record<string, any>): string {
  let result = template;

  // Process conditional blocks {{#if variable}}...{{/if}}
  const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, varName, content) => {
    const value = variables[varName];
    return value ? content : '';
  });

  // Replace simple variables {{variable}}
  const varRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(varRegex, (match, varName) => {
    const value = variables[varName];
    return value !== undefined && value !== null ? String(value) : '';
  });

  return result;
}

export async function getTemplate(
  supabase: any,
  templateKey: string
): Promise<{ subject: string; body_html: string } | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('subject, body_html')
    .eq('key', templateKey)
    .single();

  if (error) {
    console.error('Error fetching template:', error);
    return null;
  }

  return data;
}
