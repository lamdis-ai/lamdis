/**
 * Derived Evidence Extractor
 *
 * Extracts structured, non-sensitive evidence summaries from raw evidence data
 * before the raw data is discarded in customer-owned vault mode. This allows
 * reviewers to understand what was evaluated and why, without storing raw artifacts.
 */

export interface DerivedEvidenceItem {
  type: 'schema_shape' | 'required_fields' | 'validation_summary' | 'assertion_snapshot' | 'data_summary';
  label: string;
  data: any;
  extractedAt: string;
}

function extractSchemaShape(data: any, maxDepth = 3, depth = 0): any {
  if (depth >= maxDepth || data == null) return typeof data;
  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    return [`Array<${typeof data[0]}>(${data.length})`];
  }
  if (typeof data === 'object') {
    const shape: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      shape[key] = extractSchemaShape(data[key], maxDepth, depth + 1);
    }
    return shape;
  }
  return typeof data;
}

function truncateValue(value: any, maxLen = 100): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str == null) return 'null';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

/**
 * Extract derived evidence from raw evidence data.
 */
export function extractDerivedEvidence(
  evidenceData: any,
  evidenceModel: any,
  validationResult: { isValid: boolean; errors: string[]; warnings: string[] },
  testResults?: Array<{
    testName: string;
    status: string;
    assertions: Array<{
      assertionType: string;
      assertionName?: string;
      pass: boolean;
      score?: number;
      reasoning: string;
    }>;
  }>,
): DerivedEvidenceItem[] {
  const now = new Date().toISOString();
  const items: DerivedEvidenceItem[] = [];

  // 1. Schema shape — structure without values
  items.push({
    type: 'schema_shape',
    label: 'Data Structure',
    data: extractSchemaShape(evidenceData),
    extractedAt: now,
  });

  // 2. Required field snapshots
  const requiredFields = evidenceModel?.dataSchema?.required;
  if (Array.isArray(requiredFields) && requiredFields.length > 0 && typeof evidenceData === 'object' && evidenceData != null) {
    const fieldValues: Record<string, string> = {};
    for (const field of requiredFields) {
      const value = evidenceData[field];
      fieldValues[field] = truncateValue(value, 80);
    }
    items.push({
      type: 'required_fields',
      label: 'Required Field Values',
      data: fieldValues,
      extractedAt: now,
    });
  }

  // 3. Validation summary
  items.push({
    type: 'validation_summary',
    label: 'Validation Result',
    data: {
      isValid: validationResult.isValid,
      errorCount: validationResult.errors?.length ?? 0,
      warningCount: validationResult.warnings?.length ?? 0,
      errors: (validationResult.errors || []).slice(0, 5),
      warnings: (validationResult.warnings || []).slice(0, 5),
    },
    extractedAt: now,
  });

  // 4. Assertion input snapshots
  if (testResults && testResults.length > 0) {
    const snapshots = testResults.map(test => ({
      testName: test.testName,
      status: test.status,
      assertions: test.assertions.map(a => ({
        type: a.assertionType,
        name: a.assertionName || a.assertionType,
        pass: a.pass,
        score: a.score,
        reasoning: truncateValue(a.reasoning, 200),
      })),
    }));

    items.push({
      type: 'assertion_snapshot',
      label: 'Test Assertion Summaries',
      data: snapshots,
      extractedAt: now,
    });
  }

  // 5. Data summary
  if (typeof evidenceData === 'object' && evidenceData != null) {
    const keys = Object.keys(evidenceData);
    const arrayCounts: Record<string, number> = {};
    for (const key of keys) {
      if (Array.isArray(evidenceData[key])) {
        arrayCounts[key] = evidenceData[key].length;
      }
    }

    items.push({
      type: 'data_summary',
      label: 'Data Overview',
      data: {
        fieldCount: keys.length,
        fields: keys,
        arrayLengths: Object.keys(arrayCounts).length > 0 ? arrayCounts : undefined,
        approximateSize: JSON.stringify(evidenceData).length,
      },
      extractedAt: now,
    });
  }

  return items;
}
