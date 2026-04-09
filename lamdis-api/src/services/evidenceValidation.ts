import Ajv from 'ajv';
import type { evidenceModels } from '@lamdis/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type EvidenceModel = InferSelectModel<typeof evidenceModels>;

const ajv = new Ajv({ allErrors: true });

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates evidence data against an Evidence Model's JSON schema
 */
export async function validateEvidence(
  evidenceModel: EvidenceModel,
  data: any
): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  try {
    // Build the JSON schema from the evidence model
    const schema = {
      type: evidenceModel.dataSchema?.type || 'object',
      properties: evidenceModel.dataSchema?.properties || {},
      required: evidenceModel.dataSchema?.required || [],
      additionalProperties: evidenceModel.dataSchema?.additionalProperties ?? true,
    };

    // Compile and validate
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (!valid && validate.errors) {
      result.isValid = false;
      result.errors = validate.errors.map(err => {
        const path = err.instancePath || '/';
        return `${path}: ${err.message}`;
      });
    }

    // Additional custom validations
    if (evidenceModel.dataSchema?.required && evidenceModel.dataSchema.required.length > 0) {
      for (const requiredField of evidenceModel.dataSchema.required) {
        if (!(requiredField in data)) {
          result.errors.push(`Missing required field: ${requiredField}`);
          result.isValid = false;
        }
      }
    }

    // Check for empty objects/arrays if expected
    if (result.isValid && schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const value = data[key];
          const prop = propSchema as any;

          // Warn about empty arrays
          if (prop.type === 'array' && Array.isArray(value) && value.length === 0) {
            result.warnings.push(`Field '${key}' is an empty array`);
          }

          // Warn about null values for required fields
          if (value === null && evidenceModel.dataSchema?.required?.includes(key)) {
            result.warnings.push(`Required field '${key}' is null`);
          }
        }
      }
    }

  } catch (error) {
    result.isValid = false;
    result.errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Extract variables from evidence data based on JSON paths
 */
export function extractVariables(data: any, paths: Record<string, string>): Record<string, any> {
  const variables: Record<string, any> = {};

  for (const [varName, jsonPath] of Object.entries(paths)) {
    try {
      const value = evaluateJsonPath(data, jsonPath);
      variables[varName] = value;
    } catch (error) {
      variables[varName] = null;
    }
  }

  return variables;
}

function evaluateJsonPath(data: any, path: string): any {
  const cleanPath = path.replace(/^\$\.?/, '');

  if (!cleanPath) return data;

  const parts = cleanPath.split('.');
  let current = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return null;
    }

    const arrayMatch = part.match(/^([^[]+)\[(\*|\d+)\]$/);
    if (arrayMatch) {
      const [, field, index] = arrayMatch;
      current = current[field];

      if (!Array.isArray(current)) {
        return null;
      }

      if (index === '*') {
        return current;
      } else {
        current = current[parseInt(index, 10)];
      }
    } else {
      current = current[part];
    }
  }

  return current;
}
