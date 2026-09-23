import Anthropic from '@anthropic-ai/sdk';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { PERSONA_BY_ROLE, type AssistantTool, type Persona } from './personas/persona.js';
import { SeoInsightsService } from './seo/seo-insights.service.js';
import { buildSeoPersona } from './seo/seo.persona.js';
import { startOfTodayVn, textOf, toApiMessages, toDisplayMessages, trimHistory } from './history.js';

type BetaMessage = Anthropic.Beta.BetaMessage;
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
type BetaToolResultBlockParam = Anthropic.Beta.BetaToolResultBlockParam;

/** Số lượt hỏi gần nhất gửi lên API (hội thoại dài hơn thì bỏ bớt phần đầu). */
const MAX_TURNS = 20;
/** Số vòng gọi tool tối đa cho một câu hỏi - hết thì buộc model trả lời bằng dữ liệu đang có. */
const MAX_TOOL_ROUNDS = 8;
const MAX_TOKENS = 32_000;
const RETENTION_DAYS = 90;

export type ChatEvent =
  /** Đã qua các bước kiểm tra, bắt đầu gọi model - controller mở luồng SSE ở đây. */
  | { type: 'start' }
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; label: string };

export interface ChatResult {
  text: string;
  toolsUsed: string[];
  /** Model dừng vì hết max_tokens - câu trả lời có thể bị cắt. */
  truncated: boolean;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

const NO_PERSONA_MESSAGE = 'Trợ lý AI cho vai trò của bạn đang được phát triển.';
const REFUSAL_TEXT =
  'Xin lỗi, mình không thể trả lời câu hỏi này. Bạn thử diễn đạt lại hoặc hỏi về SEO/traffic của các website nhé.';

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private client?: Anthropic;
  /** Chặn gửi 2 tin cùng lúc trong một hội thoại (lịch sử sẽ bị xen kẽ sai thứ tự). */
  private readonly busyConversations = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private insights: SeoInsightsService,
    private dashboard: DashboardService,
  ) {}

  personaFor(user: JwtPayload): Persona | null {
    const key = PERSONA_BY_ROLE[user.role];
    if (key === 'seo') return buildSeoPersona({ insights: this.insights, dashboard: this.dashboard }, user);
    return null;
  }

  private dailyLimit(): number {
    return Number(this.config.get('ASSISTANT_DAILY_MSG_LIMIT') ?? 50);
  }

  private countToday(userId: string) {
    return this.prisma.assistantMessage.count({
      where: {
        role: 'user',
        createdAt: { gte: startOfTodayVn() },
        conversation: { userId },
      },
    });
  }

  async status(user: JwtPayload) {
    const persona = this.personaFor(user);
    return {
      available: persona !== null,
      persona: persona?.key ?? null,
      message: persona ? null : NO_PERSONA_MESSAGE,
      dailyLimit: this.dailyLimit(),
      usedToday: await this.countToday(user.sub),
      retentionDays: RETENTION_DAYS,
    };
  }

  listConversations(user: JwtPayload) {
    return this.prisma.assistantConversation.findMany({
      where: { userId: user.sub },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, persona: true, createdAt: true, updatedAt: true },
    });
  }

  async createConversation(user: JwtPayload) {
    const persona = this.personaFor(user);
    if (!persona) throw new ForbiddenException(NO_PERSONA_MESSAGE);
    return this.prisma.assistantConversation.create({
      data: { userId: user.sub, persona: persona.key },
      select: { id: true, title: true, persona: true, createdAt: true, updatedAt: true },
    });
  }

  /** Chỉ chủ hội thoại mới thấy - người khác nhận 404 như thể không tồn tại. */
  private async findOwned(user: JwtPayload, id: string) {
    const conversation = await this.prisma.assistantConversation.findFirst({
      where: { id, userId: user.sub },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy hội thoại');
    return conversation;
  }

  async getMessages(user: JwtPayload, id: string) {
    await this.findOwned(user, id);
    const rows = await this.prisma.assistantMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    return toDisplayMessages(rows);
  }

  async deleteConversation(user: JwtPayload, id: string) {
    await this.findOwned(user, id);
    await this.prisma.assistantConversation.delete({ where: { id } });
    return { ok: true };
  }

  async sendMessage(
    user: JwtPayload,
    conversationId: string,
    text: string,
    onEvent: (e: ChatEvent) => void = () => {},
  ): Promise<ChatResult> {
    const conversation = await this.findOwned(user, conversationId);
    const persona = this.personaFor(user);
    // Role có thể đã bị đổi sau khi tạo hội thoại - không cho tiếp tục bằng persona cũ.
    if (!persona || persona.key !== conversation.persona) {
      throw new ForbiddenException(persona ? 'Hội thoại này thuộc trợ lý khác' : NO_PERSONA_MESSAGE);
    }
    if ((await this.countToday(user.sub)) >= this.dailyLimit()) {
      throw new HttpException(
        `Bạn đã dùng hết ${this.dailyLimit()} tin nhắn hôm nay, quay lại vào ngày mai nhé.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (this.busyConversations.has(conversationId)) {
      throw new ConflictException('Trợ lý đang trả lời tin nhắn trước, đợi chút nhé.');
    }

    const client = this.getClient();
    this.busyConversations.add(conversationId);
    // Id các dòng lưu trong lượt này - lỗi giữa chừng thì xoá hết để lịch sử sạch,
    // người dùng gửi lại được và lượt lỗi không bị tính vào giới hạn trong ngày.
    const turnRowIds: string[] = [];
    try {
      const userRow = await this.prisma.assistantMessage.create({
        data: { conversationId, role: 'user', content: text },
      });
      turnRowIds.push(userRow.id);
      onEvent({ type: 'start' });
      // Đổi updatedAt để cron xoá tính 90 ngày từ lần chat cuối.
      await this.prisma.assistantConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      const rows = await this.prisma.assistantMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      });
      const result = await this.runLoop(
        client,
        conversationId,
        persona,
        toApiMessages(trimHistory(rows, MAX_TURNS)),
        onEvent,
        turnRowIds,
      );
      // Đặt tên sau khi trả lời xong - lượt lỗi bị xoá thì hội thoại không mang tên câu hỏi không có trong đó.
      if (!conversation.title) {
        await this.prisma.assistantConversation.update({
          where: { id: conversationId },
          data: { title: text.slice(0, 80) },
        });
      }
      return result;
    } catch (err) {
      if (turnRowIds.length > 0) {
        await this.prisma.assistantMessage.deleteMany({ where: { id: { in: turnRowIds } } });
      }
      throw this.toHttpError(err);
    } finally {
      this.busyConversations.delete(conversationId);
    }
  }

  private async runLoop(
    client: Anthropic,
    conversationId: string,
    persona: Persona,
    messages: BetaMessageParam[],
    onEvent: (e: ChatEvent) => void,
    turnRowIds: string[],
  ): Promise<ChatResult> {
    const toolsByName = new Map(persona.tools.map((t) => [t.name, t]));
    const apiTools = persona.tools.map(toApiTool);
    const fallbacks = this.config.get<string>('ASSISTANT_FALLBACKS') ?? 'default';
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    const texts: string[] = [];
    const toolsUsed: string[] = [];
    let jsonRetries = 0;

    for (let round = 0; ; round++) {
      const stream = client.beta.messages.stream({
        model: this.config.get<string>('ASSISTANT_MODEL') ?? 'claude-opus-5',
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: (this.config.get<string>('ASSISTANT_EFFORT') ?? 'medium') as 'low' | 'medium' | 'high',
        },
        // Model bị bộ lọc an toàn từ chối nhầm thì API tự chạy lại bằng model dự phòng.
        ...(fallbacks === 'default'
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
        // Tự cache phần tiền tố ổn định (tools + system + lịch sử) giữa các lượt.
        cache_control: { type: 'ephemeral' },
        system: persona.system,
        tools: apiTools,
        tool_choice: round >= MAX_TOOL_ROUNDS ? { type: 'none' } : { type: 'auto' },
        messages,
      });
      stream.on('text', (delta) => onEvent({ type: 'text', delta }));

      let message: BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Chỉ thử lại khi tool input không parse được (eager_input_streaming); lỗi API thì ném ra.
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        this.logger.warn(`Tool input không hợp lệ, gọi lại lượt này: ${(err as Error).message}`);
        continue;
      }

      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;

      if (message.stop_reason === 'refusal') {
        // Không lưu phần trả lời dở - lịch sử vẫn hợp lệ (2 tin user liền nhau được API gộp lại).
        this.logger.warn(`Refusal: ${JSON.stringify(message.stop_details)}`);
        onEvent({ type: 'text', delta: REFUSAL_TEXT });
        return { text: REFUSAL_TEXT, toolsUsed, truncated: false, usage };
      }

      const wantsTools = message.stop_reason === 'tool_use';
      // tool_use bị cắt dở (max_tokens) sẽ không có tool_result đi kèm → bỏ đi trước khi lưu,
      // nếu không lượt sau API sẽ báo lỗi.
      const content = wantsTools ? message.content : message.content.filter((b) => b.type !== 'tool_use');
      turnRowIds.push((await this.saveMessage(conversationId, 'assistant', content, message.usage)).id);
      messages.push({ role: 'assistant', content });

      const text = textOf(content);
      if (text) texts.push(text);

      if (message.stop_reason === 'pause_turn') continue;
      if (!wantsTools) {
        return { text: texts.join('\n\n'), toolsUsed, truncated: message.stop_reason === 'max_tokens', usage };
      }

      const toolUses = content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');
      const results = await Promise.all(
        toolUses.map((block) => {
          if (!toolsUsed.includes(block.name)) toolsUsed.push(block.name);
          const tool = toolsByName.get(block.name);
          if (tool) onEvent({ type: 'tool', name: tool.name, label: tool.statusLabel });
          return this.runTool(tool, block);
        }),
      );
      // Mọi tool_result của một lượt phải nằm chung một message.
      turnRowIds.push((await this.saveMessage(conversationId, 'tool', results)).id);
      messages.push({ role: 'user', content: results });
    }
  }

  private async runTool(
    tool: AssistantTool | undefined,
    block: BetaToolUseBlock,
  ): Promise<BetaToolResultBlockParam> {
    const error = (msg: string): BetaToolResultBlockParam => ({
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content: msg,
    });
    if (!tool) return error(`Không có tool "${block.name}"`);

    const parsed = tool.inputSchema.safeParse(block.input);
    if (!parsed.success) {
      return error(`Tham số không hợp lệ: ${z.prettifyError(parsed.error)}`);
    }
    try {
      const result = await tool.run(parsed.data);
      return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
    } catch (err) {
      this.logger.error(`Tool ${tool.name} lỗi`, err as Error);
      return error('Lỗi khi truy vấn dữ liệu, thử lại hoặc dùng tham số khác.');
    }
  }

  private saveMessage(
    conversationId: string,
    role: 'assistant' | 'tool',
    content: unknown,
    usage?: Anthropic.Beta.BetaUsage,
  ) {
    return this.prisma.assistantMessage.create({
      data: {
        conversationId,
        role,
        content: content as Prisma.InputJsonValue,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        cacheReadTokens: usage?.cache_read_input_tokens ?? undefined,
      },
    });
  }

  /** Tạo client khi cần - app vẫn khởi động bình thường khi chưa cấu hình API key. */
  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) throw new ServiceUnavailableException('Chưa cấu hình ANTHROPIC_API_KEY cho Trợ lý AI.');
      // Chỉ cần khi API key không gắn với workspace nào (API trả 400 yêu cầu header này).
      const workspaceId = this.config.get<string>('ANTHROPIC_WORKSPACE_ID');
      this.client = new Anthropic({
        apiKey,
        ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
      });
    }
    return this.client;
  }

  private toHttpError(err: unknown): unknown {
    if (err instanceof HttpException) return err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      this.logger.error('ANTHROPIC_API_KEY không hợp lệ hoặc không có quyền', err);
      return new ServiceUnavailableException('Trợ lý AI đang gặp lỗi cấu hình, báo admin kiểm tra API key.');
    }
    if (err instanceof Anthropic.BadRequestError) {
      // Request do chính server dựng nên 400 = lỗi cấu hình (key/workspace/model), không phải lỗi người dùng.
      this.logger.error(`Claude API từ chối request: ${err.message}`);
      return new ServiceUnavailableException(
        'Trợ lý AI đang gặp lỗi cấu hình, báo admin kiểm tra API key/workspace.',
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return new HttpException('Trợ lý AI đang quá tải, thử lại sau ít phút.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) {
      return new ServiceUnavailableException('Không kết nối được tới dịch vụ AI, thử lại sau.');
    }
    this.logger.error('Lỗi Trợ lý AI', err as Error);
    return new InternalServerErrorException('Trợ lý AI gặp lỗi, thử lại sau.');
  }

  /** Xoá hội thoại không hoạt động quá 90 ngày (tin nhắn xoá theo nhờ onDelete: Cascade). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Asia/Ho_Chi_Minh' })
  async purgeOldConversations() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.assistantConversation.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    if (count > 0) this.logger.log(`Đã xoá ${count} hội thoại AI không hoạt động quá ${RETENTION_DAYS} ngày`);
  }
}

/** Zod → JSON Schema cho API. `eager_input_streaming` vì request luôn stream; input được validate lại ở runTool. */
export function toApiTool(tool: AssistantTool): Anthropic.Beta.BetaTool {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.inputSchema, { io: 'input' }) as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  };
}
