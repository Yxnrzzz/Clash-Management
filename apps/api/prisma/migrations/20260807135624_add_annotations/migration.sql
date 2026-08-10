-- CreateEnum
CREATE TYPE "AnnotationKind" AS ENUM ('RECT', 'ARROW', 'FREEHAND', 'TEXT');

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "kind" "AnnotationKind" NOT NULL,
    "geometry" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#ef4444',
    "strokeWidth" DOUBLE PRECISION NOT NULL DEFAULT 0.004,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Annotation_attachmentId_pageNumber_idx" ON "Annotation"("attachmentId", "pageNumber");

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
