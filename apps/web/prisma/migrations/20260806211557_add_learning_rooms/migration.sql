-- CreateTable
CREATE TABLE "learning_paths" (
    "id" UUID NOT NULL,
    "created_by" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_rooms" (
    "id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "learning_path_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_room_members" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_room_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_rooms_host_id_idx" ON "learning_rooms"("host_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_room_members_room_id_user_id_key" ON "learning_room_members"("room_id", "user_id");

-- AddForeignKey
ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_rooms" ADD CONSTRAINT "learning_rooms_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_rooms" ADD CONSTRAINT "learning_rooms_learning_path_id_fkey" FOREIGN KEY ("learning_path_id") REFERENCES "learning_paths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_room_members" ADD CONSTRAINT "learning_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "learning_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_room_members" ADD CONSTRAINT "learning_room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
