/**
 * JSON Schema provided to the model via response_format.
 * Only these top-level fields are accepted; KEEP THIS STABLE or version bump
 * the `name` and surface version negotiation in the assistant module.
 */
export const aiBuilderResponseSchema = {
  name: 'lamdis_builder_response',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['version','response','operations'],
    properties: {
      version: { type: 'string', enum: ['1.0'] },
      response: { type: 'string', description: 'Conversational assistant reply for the user in natural language.' },
      summary: { type: 'string', description: 'Optional short summary of what was interpreted.' },
      questions: { type: 'array', items: { type: 'string' }, description: 'Follow-up clarification questions if needed; leave operations empty when asking.' },
      operations: {
        type: 'array',
        description: 'Proposed create/update/delete/publish operations. Empty if more info needed.',
        items: {
          type: 'object',
          required: ['op_id','resource','action','data'],
          additionalProperties: false,
          properties: {
            op_id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' },
            resource: { type: 'string', enum: ['knowledge_article','request','connection','action','manifest','manifest_publish','variable','workflow','manifest_actions'] },
            action: { type: 'string', description: 'create | update | delete | publish | activate | execute | run | set | list' },
            // OpenAI validator requires additionalProperties to be explicit; allow flexible op data
            data: { type: 'object', additionalProperties: true },
            depends_on: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' }
          }
        }
      }
    }
  }
};
