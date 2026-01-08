import { inject, Injectable, OnDestroy, NgZone } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';

export interface CustomIntro {
  id: string;
  twitchUserId: string;
  introText: string;
}

export interface User {
  twitchUserId: string;
  twitchUsername: string;
  ttsName?: string;
  ttsProviderName?: string;
  ttsVoiceId?: string;
  disableWelcome?: boolean;
  customIntros: CustomIntro[];
}

export interface UpdateUserRequest {
  ttsName?: string;
  ttsProviderName?: string;
  ttsVoiceId?: string;
  disableWelcome?: boolean;
}

export interface CreateCustomIntroRequest {
  introText: string;
}

export interface UpdateCustomIntroRequest {
  introText: string;
}

export interface CreateUserRequest {
  twitchUserId: string;
  twitchUsername: string;
}

export interface UserEvent {
  type: 'created' | 'updated';
  user: User;
}

export interface InitialUsersEvent {
  type: 'initial';
  users: User[];
}

@Injectable({
  providedIn: 'root',
})
export class UsersService implements OnDestroy {
  private apiUrl = 'http://localhost:3000/api';

  private http = inject(HttpClient);
  private ngZone = inject(NgZone);
  private usersSubject = new BehaviorSubject<User[]>([]);
  private eventSource: EventSource | null = null;

  public readonly users$ = this.usersSubject.asObservable();

  constructor() {
    this.connectToUsersStream();
  }

  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`);
  }

  searchUsers(query: string): Observable<User[]> {
    if (!query || query.trim() === '') {
      return of([]);
    }

    const params = new HttpParams().set('query', query);
    return this.http.get<User[]>(`${this.apiUrl}/users`, { params });
  }

  getUser(twitchUserId: string): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${twitchUserId}`);
  }

  updateUser(twitchUserId: string, updates: UpdateUserRequest): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/${twitchUserId}`, updates);
  }

  addCustomIntro(twitchUserId: string, introText: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/users/${twitchUserId}/intros`,
      { introText }
    );
  }

  updateCustomIntro(introId: string, introText: string): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.apiUrl}/users/intros/${introId}`,
      { introText }
    );
  }

  deleteCustomIntro(introId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/users/intros/${introId}`
    );
  }

  createUser(userData: CreateUserRequest): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users`, userData);
  }

  /**
   * Get current users (from BehaviorSubject via SSE)
   */
  getUsers(): Observable<User[]> {
    return this.users$;
  }

  /**
   * Connect to SSE stream and update users subject
   */
  private connectToUsersStream(): void {
    try {
      this.eventSource = new EventSource(`${this.apiUrl}/users/stream`);

      this.eventSource.onmessage = (event) => {
        try {
          const data: UserEvent | InitialUsersEvent = JSON.parse(event.data);
          console.log('Received user update:', data);
          
          // Run inside Angular zone to trigger change detection
          this.ngZone.run(() => {
            if (data.type === 'initial') {
              // Replace entire list with initial users
              this.usersSubject.next(data.users);
            } else if (data.type === 'created') {
              // Add new user to list
              const currentUsers = this.usersSubject.value;
              // Check if user already exists (shouldn't happen, but be safe)
              const exists = currentUsers.some(u => u.twitchUserId === data.user.twitchUserId);
              if (!exists) {
                const updatedUsers = [...currentUsers, data.user];
                // Sort alphabetically by username
                updatedUsers.sort((a, b) => 
                  a.twitchUsername.toLowerCase().localeCompare(b.twitchUsername.toLowerCase())
                );
                this.usersSubject.next(updatedUsers);
              }
            } else if (data.type === 'updated') {
              // Replace existing user in list
              const currentUsers = this.usersSubject.value;
              const updatedUsers = currentUsers.map(u => 
                u.twitchUserId === data.user.twitchUserId ? data.user : u
              );
              // Re-sort after update (in case username changed)
              updatedUsers.sort((a, b) => 
                a.twitchUsername.toLowerCase().localeCompare(b.twitchUsername.toLowerCase())
              );
              this.usersSubject.next(updatedUsers);
            }
          });
        } catch (error) {
          console.error('Error parsing user update:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        // EventSource will automatically attempt to reconnect
        // But we can also implement a manual retry with delay if needed
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          // Connection closed, retry after 3 seconds
          setTimeout(() => {
            if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
              this.connectToUsersStream();
            }
          }, 3000);
        }
      };
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      // Retry after 3 seconds
      setTimeout(() => {
        this.connectToUsersStream();
      }, 3000);
    }
  }

  /**
   * Cleanup (call this in ngOnDestroy if needed)
   */
  ngOnDestroy(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

