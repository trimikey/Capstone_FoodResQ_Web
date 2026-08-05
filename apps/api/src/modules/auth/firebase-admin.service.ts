import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private app: App | null = null;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    // Store the key on one .env line with literal \n, then restore real newlines.
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) return;

    try {
      this.app =
        getApps()[0] ??
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    } catch (error) {
      this.app = null;
      this.logger.warn(
        `Firebase Admin is disabled because FIREBASE_PRIVATE_KEY is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    if (!this.app) {
      throw new ServiceUnavailableException('Firebase is not configured on the server');
    }
    return getAuth(this.app).verifyIdToken(idToken);
  }
}
