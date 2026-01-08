import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { UserDto } from '../dto/user.dto';

export interface UserEvent {
  type: 'created' | 'updated';
  user: UserDto;
}

export interface InitialUsersEvent {
  type: 'initial';
  users: UserDto[];
}

@Injectable()
export class UserEventService {
  private logger = new Logger(UserEventService.name);
  private userSubject = new Subject<UserEvent | InitialUsersEvent>();

  /**
   * Observable that emits user updates
   * Services subscribe to this to broadcast changes
   */
  public readonly userUpdates$ = this.userSubject.asObservable();

  /**
   * Emit a user created event
   */
  emitUserCreated(user: UserDto): void {
    this.logger.log('Emitting user created event', { twitchUserId: user.twitchUserId });
    this.userSubject.next({ type: 'created', user });
  }

  /**
   * Emit a user updated event
   */
  emitUserUpdated(user: UserDto): void {
    this.logger.log('Emitting user updated event', { twitchUserId: user.twitchUserId });
    this.userSubject.next({ type: 'updated', user });
  }

  /**
   * Emit initial users list
   */
  emitInitialUsers(users: UserDto[]): void {
    this.logger.log('Emitting initial users list', { count: users.length });
    this.userSubject.next({ type: 'initial', users });
  }
}
