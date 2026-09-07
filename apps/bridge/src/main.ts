import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from './app/app.module';

function loadBridgeEnv() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/bridge/.env'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      loadEnv({ path, override: false });
    }
  }
}

async function bootstrap() {
  loadBridgeEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const swagger = new DocumentBuilder()
    .setTitle('Speakosaurus Bridge')
    .setDescription('Remote moderator relay API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = process.env.PORT || 3333;
  await app.listen(port);
  Logger.log(`Bridge running on http://localhost:${port}/api`);
}

bootstrap();
