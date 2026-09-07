import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionManagerService } from '../services/session-manager.service';

export interface AuthenticatedRequest extends Request {
  moderator?: {
    modTwitchId: string;
    modTwitchUsername: string;
    sessionId: string;
  };
}

@Injectable()
export class ModeratorAuthGuard implements CanActivate {
  constructor(private readonly sessionManager: SessionManagerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    try {
      const accessInfo = await this.sessionManager.validateModeratorToken(token);
      request.moderator = {
        modTwitchId: accessInfo.modTwitchId,
        modTwitchUsername: accessInfo.modTwitchUsername,
        sessionId: accessInfo.sessionId,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
