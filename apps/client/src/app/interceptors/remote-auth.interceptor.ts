import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ConnectionConfigService } from '../services/connection-config.service';

export const remoteAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const connection = inject(ConnectionConfigService);
  const token = connection.getConfig().moderatorToken;
  if (connection.isRemoteMode() && token) {
    return next(
      req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      }),
    );
  }
  return next(req);
};
