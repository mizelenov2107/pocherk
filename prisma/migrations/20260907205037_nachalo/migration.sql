-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('TRIAL', 'START', 'STANDARD', 'SESSION');

-- CreateEnum
CREATE TYPE "QuotaKind" AS ENUM ('AUDIO_MINUTE', 'HAND_PAGE', 'PDF_PAGE', 'PDF_SCAN_PAGE', 'REBUILD');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('AUDIO', 'HANDWRITING', 'SLIDES', 'PDF');

-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('TRANSCODE', 'VAD', 'TRANSCRIBE', 'OCR', 'EXTRACT', 'SEGMENT', 'FORMULA', 'EMBED', 'BUILD_NOTE', 'ACCEPT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "TopicRelationKind" AS ENUM ('PREREQ', 'RELATED', 'CONTRAST');

-- CreateEnum
CREATE TYPE "VersionReason" AS ENUM ('BUILD', 'REBUILD', 'USER_EDIT', 'ROLLBACK');

-- CreateEnum
CREATE TYPE "BlockRole" AS ENUM ('HEADING', 'PARA', 'DEFINITION', 'OTHER_WORDS', 'FORMULA', 'LIST', 'IMAGE', 'QUESTION', 'ORG', 'SERVICE', 'GLOSSARY');

-- CreateEnum
CREATE TYPE "CitationKind" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'RESTORED_FROM');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PASS', 'WARN', 'FAIL');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('RESOLVED', 'DANGLING', 'AMBIGUOUS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailIsValid" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "telegramId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'TRIAL',
    "periodAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "audioMinutesLeft" INTEGER NOT NULL,
    "handPagesLeft" INTEGER NOT NULL,
    "pdfPagesLeft" INTEGER NOT NULL,
    "rebuildsLeft" INTEGER NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "QuotaKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "costRub" DECIMAL(12,4) NOT NULL,
    "vendor" TEXT NOT NULL,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" TEXT,
    "exampleSet" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "authority" INTEGER NOT NULL,
    "lessonNo" INTEGER,
    "lessonDate" TIMESTAMP(3),
    "durationMs" INTEGER,
    "pageCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "pageNo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "stage" "JobStage" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "vendorOpId" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "tokensCacheRead" INTEGER,
    "costRub" DECIMAL(12,4),
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fragment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "shortRef" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startMs" INTEGER,
    "endMs" INTEGER,
    "pageNo" INTEGER,
    "bbox" JSONB,
    "speaker" TEXT,
    "confidence" DOUBLE PRECISION,
    "tsv" tsvector,
    "embedding" halfvec(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aliases" TEXT[],
    "parentId" TEXT,
    "embedding" halfvec(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicRelation" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" "TopicRelationKind" NOT NULL,

    CONSTRAINT "TopicRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FragmentTopic" (
    "fragmentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "FragmentTopic_pkey" PRIMARY KEY ("fragmentId","topicId")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "disambiguator" TEXT,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteVersion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "reason" "VersionReason" NOT NULL,
    "markdown" TEXT NOT NULL,
    "acceptance" JSONB,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteBlock" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "role" "BlockRole" NOT NULL,
    "stableKey" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "restored" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NoteBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockCitation" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "kind" "CitationKind" NOT NULL DEFAULT 'SUPPORTS',
    "quote" TEXT,

    CONSTRAINT "BlockCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteCheck" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "layer" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aliases" TEXT[],
    "notation" TEXT,
    "definition" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermMention" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,

    CONSTRAINT "TermMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteLink" (
    "id" TEXT NOT NULL,
    "fromNoteId" TEXT NOT NULL,
    "toNoteId" TEXT,
    "rawTarget" TEXT NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'DANGLING',

    CONSTRAINT "NoteLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandwritingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "blocksDone" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandwritingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandwritingSample" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "truth" TEXT NOT NULL,
    "block" INTEGER NOT NULL,
    "ord" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandwritingSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "bbox" JSONB,
    "recognized" TEXT NOT NULL,
    "corrected" TEXT NOT NULL,
    "usedInKey" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "QuotaEntry_userId_createdAt_idx" ON "QuotaEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuotaEntry_vendor_createdAt_idx" ON "QuotaEntry"("vendor", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Course_userId_title_key" ON "Course"("userId", "title");

-- CreateIndex
CREATE INDEX "Source_courseId_kind_idx" ON "Source"("courseId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_objectKey_key" ON "Asset"("objectKey");

-- CreateIndex
CREATE INDEX "Asset_sha256_idx" ON "Asset"("sha256");

-- CreateIndex
CREATE INDEX "Asset_expiresAt_idx" ON "Asset"("expiresAt");

-- CreateIndex
CREATE INDEX "Job_status_stage_idx" ON "Job"("status", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Job_sourceId_stage_key" ON "Job"("sourceId", "stage");

-- CreateIndex
CREATE INDEX "Fragment_sourceId_startMs_idx" ON "Fragment"("sourceId", "startMs");

-- CreateIndex
CREATE INDEX "Fragment_sourceId_pageNo_idx" ON "Fragment"("sourceId", "pageNo");

-- CreateIndex
CREATE UNIQUE INDEX "Fragment_sourceId_shortRef_key" ON "Fragment"("sourceId", "shortRef");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_courseId_title_key" ON "Topic"("courseId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "TopicRelation_fromId_toId_kind_key" ON "TopicRelation"("fromId", "toId", "kind");

-- CreateIndex
CREATE INDEX "FragmentTopic_topicId_idx" ON "FragmentTopic"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_currentVersionId_key" ON "Note"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_courseId_normalizedTitle_key" ON "Note"("courseId", "normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "NoteVersion_noteId_n_key" ON "NoteVersion"("noteId", "n");

-- CreateIndex
CREATE INDEX "NoteBlock_versionId_ord_idx" ON "NoteBlock"("versionId", "ord");

-- CreateIndex
CREATE UNIQUE INDEX "NoteBlock_versionId_stableKey_key" ON "NoteBlock"("versionId", "stableKey");

-- CreateIndex
CREATE INDEX "BlockCitation_fragmentId_idx" ON "BlockCitation"("fragmentId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockCitation_blockId_fragmentId_kind_key" ON "BlockCitation"("blockId", "fragmentId", "kind");

-- CreateIndex
CREATE INDEX "NoteCheck_versionId_layer_idx" ON "NoteCheck"("versionId", "layer");

-- CreateIndex
CREATE UNIQUE INDEX "Term_courseId_title_key" ON "Term"("courseId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "TermMention_termId_blockId_key" ON "TermMention"("termId", "blockId");

-- CreateIndex
CREATE INDEX "NoteLink_fromNoteId_idx" ON "NoteLink"("fromNoteId");

-- CreateIndex
CREATE INDEX "NoteLink_toNoteId_idx" ON "NoteLink"("toNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "HandwritingProfile_userId_key" ON "HandwritingProfile"("userId");

-- CreateIndex
CREATE INDEX "HandwritingSample_profileId_ord_idx" ON "HandwritingSample"("profileId", "ord");

-- CreateIndex
CREATE INDEX "Correction_userId_usedInKey_idx" ON "Correction"("userId", "usedInKey");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotaEntry" ADD CONSTRAINT "QuotaEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotaEntry" ADD CONSTRAINT "QuotaEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fragment" ADD CONSTRAINT "Fragment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRelation" ADD CONSTRAINT "TopicRelation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRelation" ADD CONSTRAINT "TopicRelation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragmentTopic" ADD CONSTRAINT "FragmentTopic_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "Fragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragmentTopic" ADD CONSTRAINT "FragmentTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "NoteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteBlock" ADD CONSTRAINT "NoteBlock_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockCitation" ADD CONSTRAINT "BlockCitation_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "NoteBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockCitation" ADD CONSTRAINT "BlockCitation_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "Fragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteCheck" ADD CONSTRAINT "NoteCheck_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "NoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermMention" ADD CONSTRAINT "TermMention_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_fromNoteId_fkey" FOREIGN KEY ("fromNoteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_toNoteId_fkey" FOREIGN KEY ("toNoteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandwritingProfile" ADD CONSTRAINT "HandwritingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandwritingSample" ADD CONSTRAINT "HandwritingSample_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "HandwritingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
