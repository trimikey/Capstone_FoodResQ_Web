"""
Spread each class description across every section where that class appears in
the matching puml file, so that AdminController gets the same description in
Dashboard, Users, and Catalog sections of class-admin.puml.

Also seeds descriptions for the well-known helper classes:
- PrismaService, JwtService, StorageService, NotificationsService,
  TrustService, SystemConfigService, FaceMatchService, Redlock, Redis,
  MailService, FirebaseAdminService, JwtAuthGuard, ThrottlerGuard,
  JwtStrategy, DeliveriesService, MaxFileSizeValidator, FileTypeValidator,
  FileSystem, ParseFilePipe.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, r"d:\Do_An\foodresq\docs\diagrams\.class-specs-data")
from build_docx import parse_puml

BASE = Path(r"d:\Do_An\foodresq\docs\diagrams")
DATA_DIR = BASE / ".class-specs-data"


# Descriptions for helper classes (class-level + per-method)
HELPER_CLASS_DESCRIPTIONS = {
    "PrismaService": {
        "description": "Prisma ORM client wrapper. Each field exposes a model delegate used by services to issue typed queries and mutations.",
        "methods": {},  # delegates are self-describing
    },
    "JwtService": {
        "description": "Wrapper around the jsonwebtoken library: signing access tokens and verifying incoming tokens on protected routes.",
        "methods": {
            "+sign(payload: JwtPayload, options: SignOptions): string": "Signs a JWT with the configured secret and TTL.",
            "+verify(token: string, options: VerifyOptions): JwtPayload": "Verifies a JWT signature and expiry; throws on invalid or expired tokens.",
        },
    },
    "StorageService": {
        "description": "Local-disk image storage with MIME + magic-byte validation. Production deployments swap this implementation for S3 / R2 / Cloudinary without touching callers.",
        "methods": {
            "+saveImage(file: File, subdir: string): Promise<string>": "Validates the file, picks a path under {uploadRoot}/{subdir}/, writes the buffer, returns the public URL.",
            "+imageExists(url: string): Promise<boolean>": "Cheap existence probe used by cleanup jobs.",
            "-matchesMagicBytes(buffer: Buffer, mimetype: string): boolean": "Verifies the file signature matches the declared MIME type.",
        },
    },
    "NotificationsService": {
        "description": "Single entry point for emitting notifications; persists the row, then pushes the payload into the user's socket room through NotificationsGateway. Idempotent via dedupeKey.",
        "methods": {
            "+notify(userId: string, input: NotifyInput): Promise<Notification>": "Persists the notification (deduped by dedupeKey) and emits the socket event.",
            "+notifyAdmins(input: NotifyInput): Promise<number>": "Broadcasts to every user with role=admin.",
            "+notifyCampaignOwner(campaignId: string, input: NotifyInput): Promise<number>": "Looks up the campaign owner and notifies them.",
            "+listMine(userId: string): Promise<Notification[]>": "Lists the user's notifications.",
            "+unreadCount(userId: string): Promise<CountResult>": "Returns the unread badge count.",
            "+saveDeviceToken(userId: string, token: string): Promise<OkResult>": "Persists the FCM device token for push notifications.",
            "+markRead(id: string, userId: string): Promise<OkResult>": "Marks a single notification as read.",
            "+markAllRead(userId: string): Promise<OkResult>": "Marks every unread notification as read.",
        },
    },
    "TrustService": {
        "description": "Trust-score writer: applies a signed delta with a reason, persists a trust_score_history row, and re-evaluates the restricted / banned thresholds (60 / 30).",
        "methods": {
            "+applyDelta(userId: string, delta: number, reason: TrustScoreReason): Promise<void>": "Adjusts users.trust_score, writes a history row, applies restricted/banned status when thresholds are crossed.",
        },
    },
    "SystemConfigService": {
        "description": "Runtime-tunable business parameters (daily quota, search radius, QR validity, trust thresholds). Other modules call this on every request rather than reading environment variables directly.",
        "methods": {
            "+getAll(): Promise<ConfigItem[]>": "Returns the full config table (admin view).",
            "+getNumber(key: string): Promise<number>": "Reads a numeric config entry by key; throws if missing.",
            "+set(key: string, value: number, userId: string): Promise<ConfigItem>": "Updates a config entry; writes an audit log.",
        },
    },
    "FaceMatchService": {
        "description": "Face descriptor extraction and comparison using a local face-recognition model. Descriptors are 128-d vectors used for both 1:1 (live vs enrolled) and 1:N matching.",
        "methods": {
            "+getFaceDescriptor(photo: File): Promise<number[]>": "Extracts a 128-d descriptor from the input photo; throws if no face is detected.",
            "+compare(a: number[], b: number[]): MatchResult": "Compares two descriptors and returns the match score plus a boolean accepted flag.",
        },
    },
    "Redlock": {
        "description": "Redis-based distributed lock used to serialise concurrent reservation attempts on the same listing.",
        "methods": {
            "+acquire(resources: string[], ttl: number): Promise<Lock>": "Tries to acquire the named lock; throws if another holder still owns it within the TTL window.",
            "+release(): Promise<void>": "Releases a previously acquired lock; safe to call multiple times.",
        },
    },
    "Redis": {
        "description": "ioredis client; a thin wrapper around the most common Redis commands.",
        "methods": {
            "+setex(key: string, ttl: number, value: string): Promise<void>": "Sets a key with a TTL in seconds.",
            "+get(key: string): Promise<string>": "Reads a string value; returns null on miss.",
            "+del(key: string): Promise<number>": "Deletes a key and returns the count removed.",
        },
    },
    "MailService": {
        "description": "Outbound mail sender, currently backed by SMTP but designed to swap providers.",
        "methods": {
            "+sendPasswordResetEmail(email: string, name: string, token: string): Promise<void>": "Sends the password-reset link to the user.",
        },
    },
    "FirebaseAdminService": {
        "description": "Firebase Admin SDK wrapper; used to verify Google / Apple id tokens before issuing a session.",
        "methods": {
            "+verifyIdToken(idToken: string): Promise<DecodedIdToken>": "Validates a Firebase id token and returns the decoded payload; throws on invalid / expired tokens.",
        },
    },
    "JwtAuthGuard": {
        "description": "NestJS guard that enforces a valid JWT on every incoming request via JwtStrategy.",
        "methods": {
            "+canActivate(ctx: ExecutionContext): boolean": "Returns true if the request carries a valid Bearer token; otherwise throws 401.",
        },
    },
    "ThrottlerGuard": {
        "description": "Rate-limit guard backed by @nestjs/throttler; protects /auth/* and other sensitive routes from brute force.",
        "methods": {
            "+canActivate(ctx: ExecutionContext): boolean": "Allows up to N requests per minute per IP / user; throws 429 when the quota is exceeded.",
        },
    },
    "JwtStrategy": {
        "description": "passport-jwt strategy: extracts the Bearer token, verifies it, and loads the corresponding User into req.user.",
        "methods": {
            "+validate(payload: JwtPayload): Promise<User>": "Loads the User referenced by the JWT payload; throws if the user no longer exists or is banned.",
        },
    },
    "DeliveriesService": {
        "description": "Delivery lifecycle service reused by other modules (reservations, campaigns). Owns the shipper-offer broadcast, status transitions and failure paths.",
        "methods": {
            "+broadcastToNearbyShippers(deliveryId: string, lng: number, lat: number): Promise<void>": "Offers the delivery to the next-nearest single available shipper with a 15s window.",
            "+createDeliveryAsync(reservationId: string, listingId: string): Promise<void>": "Materialises the Delivery row and asks broadcastToNearbyShippers to start the queue.",
        },
    },
    "MaxFileSizeValidator": {
        "description": "NestJS PipeValidator; rejects uploads larger than the configured byte limit.",
        "methods": {
            "+isValid(file: File): boolean": "Returns true when file.size is within the limit; otherwise false.",
        },
    },
    "FileTypeValidator": {
        "description": "NestJS PipeValidator; rejects uploads whose MIME type is not on the allow-list.",
        "methods": {
            "+isValid(file: File): boolean": "Returns true when the MIME type is in the allowed set.",
        },
    },
    "FileSystem": {
        "description": "fs/promises wrapper used by StorageService to mkdir and write buffers.",
        "methods": {
            "+mkdir(path: string, options: MkdirOptions): Promise<void>": "Creates a directory (recursive when recursive:true).",
            "+writeFile(path: string, data: Buffer): Promise<void>": "Writes a Buffer to disk, replacing any existing file.",
        },
    },
    "ParseFilePipe": {
        "description": "NestJS pipe that composes size + type validators and applies them to every upload endpoint.",
        "methods": {
            "+transform(file: File): File": "Runs the file through each attached validator; throws on the first failure.",
        },
    },
    "NotificationsGateway": {
        "description": "Socket.IO gateway that authenticates each connection with the JWT and emits events into per-user rooms.",
        "methods": {
            "+handleConnection(client: Socket): void": "Verifies the handshake JWT, joins the user:{userId} room, sets up disconnect cleanup.",
            "+emitToUser(userId: string, event: string, data: unknown): void": "Emits the event into the user:{userId} room only.",
        },
    },
    "CronErrorLogger": {
        "description": "Lightweight helper used by every @Cron handler to log failed jobs without crashing the Nest scheduler.",
        "methods": {
            "+logCronError(logger: Logger, handler: string, error: unknown): void": "Writes a structured error entry tagged with the handler name; never throws.",
        },
    },
    "DishStepsService": {
        "description": "Cooking-step orchestration: generates the per-item step list, unlocks steps as time arrives, records proof photos and quality flags.",
        "methods": {
            "+ensureStepsForMenuItem(campaignId: string, menuItemId: string, scheduledTimes: string[]): Promise<CampaignDishStep[]>": "Auto-generates the CampaignDishStep rows for a menu item, one per step with the given scheduled times.",
            "+getStepsForCampaign(campaignId: string, currentUserId: string): Promise<KitchenBoard>": "Builds the per-volunteer board with effective statuses.",
            "+setScheduledTimes(campaignId: string, userId: string, menuItemId: string, times: string[]): Promise<CampaignDishStep[]>": "Owner assigns scheduled times to each step.",
            "+completeStep(campaignId: string, userId: string, stepId: string, proof: File, note: string): Promise<CampaignDishStep>": "Validates the assigned volunteer, stores proof, sets status=done.",
            "+flagStepQualityFail(campaignId: string, userId: string, stepId: string, reason: string): Promise<CampaignDishStep>": "Marks quality failure, notifies the campaign owner.",
            "+computeEffectiveStatus(step: CampaignDishStep, prevDone: boolean, isFirst: boolean, campaign: CampaignTiming): CampaignMenuStepStatus": "Pure function: open iff prev step is done (or is the first) AND scheduled time has arrived.",
            "+autoOpenAvailableSteps(): Promise<number>": "Cron entry point: transitions eligible steps to open based on effective status.",
            "-assertAssignedVolunteer(campaignId: string, userId: string): Promise<VolunteerRef>": "Throws if the user is not an assigned volunteer for this campaign.",
        },
    },
    "UploadsController": {
        "description": "Upload entry points for generic images and for face/ID evidence during registration.",
        "methods": {
            "+uploadImage(kind: string, file: File): Promise<UrlResponse>": "Uploads a generic image and returns its URL.",
            "+uploadRegisterEvidence(file: File): Promise<UrlResponse>": "Uploads face + ID-card evidence during registration.",
        },
    },
}


# ---------------------------------------------------------------
# 1. Spread existing class descriptions across sections
# ---------------------------------------------------------------

for puml in sorted(BASE.glob("class-*.puml")):
    json_name = puml.name.replace("class-", "").replace(".puml", "") + ".json"
    json_path = DATA_DIR / json_name
    if not json_path.exists():
        continue
    data = json.loads(json_path.read_text(encoding="utf-8"))
    inner = data.get(puml.name, {})

    # Build class -> (description, methods) lookup from current data
    class_lookup = {}
    for sec, block in inner.items():
        if not isinstance(block, dict):
            continue
        for cls_name, cls_meta in block.get("classes", {}).items():
            if cls_name not in class_lookup:
                class_lookup[cls_name] = {
                    "description": cls_meta.get("description", ""),
                    "methods": cls_meta.get("methods", {}),
                }
            else:
                # Merge methods so any section that lacks one inherits from peers.
                for sig, desc in cls_meta.get("methods", {}).items():
                    class_lookup[cls_name]["methods"].setdefault(sig, desc)

    sections = parse_puml(puml)
    for title_text, classes in sections:
        block = inner.get(title_text)
        if not isinstance(block, dict):
            continue
        classes_data = block.setdefault("classes", {})
        # Only operate on classes that ACTUALLY appear in this section of the puml
        for cls_name in list(classes.keys()):
            existing = classes_data.get(cls_name)
            is_stub = (
                existing is not None
                and isinstance(existing.get("description", ""), str)
                and existing.get("description", "").startswith("Dependency class referenced by")
            )
            if cls_name not in classes_data or is_stub:
                if cls_name in HELPER_CLASS_DESCRIPTIONS:
                    classes_data[cls_name] = HELPER_CLASS_DESCRIPTIONS[cls_name]
                elif cls_name in class_lookup:
                    classes_data[cls_name] = {
                        "description": class_lookup[cls_name]["description"],
                        "methods": dict(class_lookup[cls_name]["methods"]),
                    }
                else:
                    classes_data[cls_name] = {
                        "description": f"Dependency class referenced by {title_text}.",
                        "methods": {},
                    }
            else:
                meta = classes_data[cls_name]
                meta.setdefault("description", class_lookup.get(cls_name, {}).get("description", ""))
                existing_methods = meta.get("methods", {})
                if cls_name in class_lookup:
                    for sig, desc in class_lookup[cls_name]["methods"].items():
                        existing_methods.setdefault(sig, desc)
                meta["methods"] = existing_methods

    data[puml.name] = inner
    json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"OK {puml.name}")

print("\nDone.")