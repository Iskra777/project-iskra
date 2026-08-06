-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "added_by" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "materials_room_id_idx" ON "materials"("room_id");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "learning_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
