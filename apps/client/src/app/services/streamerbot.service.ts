import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConnectionConfigService } from './connection-config.service';

export interface StreamerBotAction {
  enabled: boolean;
  group: string;
  id: string;
  name: string;
  subaction_count: number;
}

export interface GetActionsResponse {
  status: 'ok' | 'error';
  id: string;
  actions: StreamerBotAction[];
  count: number;
}

@Injectable({
  providedIn: 'root',
})
export class StreamerBotService {
  private http = inject(HttpClient);
  private connection = inject(ConnectionConfigService);

  getActions(): Observable<StreamerBotAction[]> {
    return this.http.get<GetActionsResponse | null>(`${this.connection.getApiUrl()}/streamerbot/actions`).pipe(
      map((response) => {
        if (response && response.actions && Array.isArray(response.actions)) {
          return response.actions;
        }
        return [];
      })
    );
  }
}
