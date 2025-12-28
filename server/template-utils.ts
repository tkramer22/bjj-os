import type { Recipient } from "@shared/schema";

export interface TemplateVariables {
  name: string;
  phone: string;
  group?: string;
}

/**
 * Substitutes template variables with actual values
 * Supported variables: {{name}}, {{phone}}, {{group}}
 */
export function substituteVariables(template: string, recipient: Recipient): string {
  const variables: TemplateVariables = {
    name: recipient.name,
    phone: recipient.phoneNumber,
    group: recipient.group || ""
  };

  let result = template;
  
  // Replace {{name}}
  result = result.replace(/\{\{name\}\}/gi, variables.name);
  
  // Replace {{phone}}
  result = result.replace(/\{\{phone\}\}/gi, variables.phone);
  
  // Replace {{group}} - only if group is defined
  if (variables.group) {
    result = result.replace(/\{\{group\}\}/gi, variables.group);
  } else {
    result = result.replace(/\{\{group\}\}/gi, "");
  }
  
  return result;
}

/**
 * Extracts all variable placeholders from a template
 */
export function extractVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1].toLowerCase());
  }
  
  return Array.from(variables);
}

/**
 * Validates that all variables in template are supported
 */
export function validateTemplate(template: string): { valid: boolean; invalidVars: string[] } {
  const supportedVars = ['name', 'phone', 'group'];
  const foundVars = extractVariables(template);
  const invalidVars = foundVars.filter(v => !supportedVars.includes(v));
  
  return {
    valid: invalidVars.length === 0,
    invalidVars
  };
}
