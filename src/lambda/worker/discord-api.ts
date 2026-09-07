/**
 * The one Discord REST call the worker makes.
 *
 * This is the same endpoint discord.js reaches through `interaction.editReply`
 * — `InteractionWebhook` is built from the application id and interaction
 * token, and `editMessage('@original', ...)` resolves to this route. The
 * interaction token authorizes it, so no bot token is involved.
 *
 * The token is valid for 15 minutes from the original interaction.
 */

const DISCORD_API = 'https://discord.com/api/v10';

export interface FollowUp {
  applicationId: string;
  interactionToken: string;
  content: string;
  /** User IDs allowed to be pinged; everything else is suppressed. */
  mentions: readonly string[];
}

/**
 * Edits the deferred "thinking…" placeholder into the real reply.
 *
 * @throws {Error} If Discord rejects the edit, with the status and body, since
 * a silent failure here leaves the user staring at the placeholder forever.
 */
export async function editOriginalResponse({
  applicationId,
  interactionToken,
  content,
  mentions,
}: FollowUp): Promise<void> {
  const url = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [], users: [...mentions] },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Discord rejected the follow-up: HTTP ${response.status} ${body || '(empty body)'}`,
    );
  }
}
