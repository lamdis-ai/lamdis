import { FastifyPluginAsync } from 'fastify';
import { invokeAssistant } from '../lib/assistant/registry.js';

/**
 * Streaming Assistant Route using Server-Sent Events (SSE)
 * Provides real-time streaming responses for the AI assistant
 */
const assistantStreamRoutes: FastifyPluginAsync = async (fastify) => {
  // SSE streaming endpoint for assistant chat
  fastify.post<{
    Params: { orgId: string };
    Body: {
      message: string;
      history?: Array<{ role: string; content: string }>;
      mode?: string;
    };
  }>('/orgs/:orgId/assistant/stream', {
    schema: {
      params: {
        type: 'object',
        properties: {
          orgId: { type: 'string' },
        },
        required: ['orgId'],
      },
      body: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          history: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
          mode: { type: 'string' },
        },
        required: ['message'],
      },
    },
  }, async (request, reply) => {
    const { orgId } = request.params;
    const { message, history = [], mode = 'lamdis' } = request.body;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Helper to send SSE events
    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Send initial event
      sendEvent('start', { status: 'processing', timestamp: new Date().toISOString() });

      // Invoke the assistant
      const result = await invokeAssistant({
        orgId,
        moduleId: mode,
        message,
        history: history.map(h => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
      });

      if (result.error) {
        sendEvent('error', { error: result.error });
      } else {
        // Send the response
        const responseData: any = {
          response: result.structured?.response || result.reply || '',
          structured: result.structured,
        };

        // If there are tool results (created resources), include them
        if (result.structured?.tool_results) {
          responseData.tool_results = result.structured.tool_results;
          
          // Send tool results as separate events for real-time UI updates
          for (const toolResult of result.structured.tool_results) {
            sendEvent('tool_result', toolResult);
          }
        }

        // Send the main response
        sendEvent('message', responseData);
      }

      // Send completion event
      sendEvent('done', { status: 'complete', timestamp: new Date().toISOString() });
      
    } catch (error: any) {
      console.error('[AssistantStream] Error:', error);
      sendEvent('error', { error: error?.message || 'Stream error' });
    } finally {
      reply.raw.end();
    }
  });
};

export default assistantStreamRoutes;
