import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1771000615393 implements MigrationInterface {
    name = 'InitialSchema1771000615393'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "aircraft_type" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(50) NOT NULL, "rows" integer NOT NULL, "columns" character varying(20) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_48233365948450420f62c447a06" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."check_in_status_enum" AS ENUM('IN_PROGRESS', 'AWAITING_PAYMENT', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "check_in" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "passenger_id" uuid NOT NULL, "flight_id" uuid NOT NULL, "seat_id" uuid, "status" "public"."check_in_status_enum" NOT NULL DEFAULT 'IN_PROGRESS', "baggage_weight" numeric(5,2), "excess_fee" numeric(10,2), "payment_id" character varying(100), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_checkin_passenger_flight" UNIQUE ("passenger_id", "flight_id"), CONSTRAINT "PK_9c026e16735aea10812a3888d6c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "passenger" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_f12da964eb55c8ab8f10fc51812" UNIQUE ("email"), CONSTRAINT "PK_50e940dd2c126adc20205e83fac" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."seat_status_enum" AS ENUM('AVAILABLE', 'HELD', 'CONFIRMED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "seat" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "flight_id" uuid NOT NULL, "row" integer NOT NULL, "column" character varying(1) NOT NULL, "status" "public"."seat_status_enum" NOT NULL DEFAULT 'AVAILABLE', "held_by" uuid, "held_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_seat_flight_row_column" UNIQUE ("flight_id", "row", "column"), CONSTRAINT "PK_4e72ae40c3fbd7711ccb380ac17" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_seat_held_by" ON "seat" ("held_by") `);
        await queryRunner.query(`CREATE INDEX "IDX_seat_flight_status" ON "seat" ("flight_id", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."flight_status_enum" AS ENUM('SCHEDULED', 'BOARDING', 'DEPARTED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "flight" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "flight_number" character varying(10) NOT NULL, "aircraft_type_id" uuid NOT NULL, "departure_time" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."flight_status_enum" NOT NULL DEFAULT 'SCHEDULED', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bf571ce6731cf071fc51b94df03" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."waitlist_status_enum" AS ENUM('WAITING', 'ASSIGNED', 'EXPIRED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "waitlist" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "flight_id" uuid NOT NULL, "passenger_id" uuid NOT NULL, "position" integer NOT NULL, "status" "public"."waitlist_status_enum" NOT NULL DEFAULT 'WAITING', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_waitlist_flight_passenger" UNIQUE ("flight_id", "passenger_id"), CONSTRAINT "PK_973cfbedc6381485681d6a6916c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_waitlist_flight_status_position" ON "waitlist" ("flight_id", "status", "position") `);
        await queryRunner.query(`CREATE TYPE "public"."audit_log_action_enum" AS ENUM('SEAT_HELD', 'SEAT_CONFIRMED', 'SEAT_RELEASED', 'SEAT_CANCELLED', 'WAITLIST_JOINED', 'WAITLIST_ASSIGNED', 'CHECKIN_STARTED', 'CHECKIN_COMPLETED', 'CHECKIN_CANCELLED', 'PAYMENT_REQUESTED', 'PAYMENT_CONFIRMED', 'ABUSE_DETECTED')`);
        await queryRunner.query(`CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "entity_type" character varying(50) NOT NULL, "entity_id" uuid NOT NULL, "action" "public"."audit_log_action_enum" NOT NULL, "from_state" character varying(50), "to_state" character varying(50) NOT NULL, "actor_id" uuid NOT NULL, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_log_created_at" ON "audit_log" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_audit_log_entity" ON "audit_log" ("entity_type", "entity_id") `);
        await queryRunner.query(`CREATE TABLE "abuse_event" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "source_ip" character varying(45) NOT NULL, "request_count" integer NOT NULL, "window_start" TIMESTAMP WITH TIME ZONE NOT NULL, "window_end" TIMESTAMP WITH TIME ZONE NOT NULL, "details" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f49f08c78915ad2c705542fbc5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_abuse_event_source_ip_created_at" ON "abuse_event" ("source_ip", "created_at") `);
        await queryRunner.query(`ALTER TABLE "check_in" ADD CONSTRAINT "FK_6365866ededb1cc7a5aed38761c" FOREIGN KEY ("passenger_id") REFERENCES "passenger"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "check_in" ADD CONSTRAINT "FK_489a1d2043569eaafa9979d08e9" FOREIGN KEY ("flight_id") REFERENCES "flight"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "check_in" ADD CONSTRAINT "FK_09acc1e952e7289074002180f9a" FOREIGN KEY ("seat_id") REFERENCES "seat"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "seat" ADD CONSTRAINT "FK_6f40642deb1a46371f806f742b0" FOREIGN KEY ("flight_id") REFERENCES "flight"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "seat" ADD CONSTRAINT "FK_1e3e8fafcd82706da878c766761" FOREIGN KEY ("held_by") REFERENCES "passenger"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "flight" ADD CONSTRAINT "FK_6d91ef15155b4b8ddc86d9cced6" FOREIGN KEY ("aircraft_type_id") REFERENCES "aircraft_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "waitlist" ADD CONSTRAINT "FK_94ca989fa59a206a73f99a0c87c" FOREIGN KEY ("flight_id") REFERENCES "flight"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "waitlist" ADD CONSTRAINT "FK_72ba5499ae4ea7a2d2af04a97a6" FOREIGN KEY ("passenger_id") REFERENCES "passenger"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "waitlist" DROP CONSTRAINT "FK_72ba5499ae4ea7a2d2af04a97a6"`);
        await queryRunner.query(`ALTER TABLE "waitlist" DROP CONSTRAINT "FK_94ca989fa59a206a73f99a0c87c"`);
        await queryRunner.query(`ALTER TABLE "flight" DROP CONSTRAINT "FK_6d91ef15155b4b8ddc86d9cced6"`);
        await queryRunner.query(`ALTER TABLE "seat" DROP CONSTRAINT "FK_1e3e8fafcd82706da878c766761"`);
        await queryRunner.query(`ALTER TABLE "seat" DROP CONSTRAINT "FK_6f40642deb1a46371f806f742b0"`);
        await queryRunner.query(`ALTER TABLE "check_in" DROP CONSTRAINT "FK_09acc1e952e7289074002180f9a"`);
        await queryRunner.query(`ALTER TABLE "check_in" DROP CONSTRAINT "FK_489a1d2043569eaafa9979d08e9"`);
        await queryRunner.query(`ALTER TABLE "check_in" DROP CONSTRAINT "FK_6365866ededb1cc7a5aed38761c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_abuse_event_source_ip_created_at"`);
        await queryRunner.query(`DROP TABLE "abuse_event"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_audit_log_entity"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_audit_log_created_at"`);
        await queryRunner.query(`DROP TABLE "audit_log"`);
        await queryRunner.query(`DROP TYPE "public"."audit_log_action_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_waitlist_flight_status_position"`);
        await queryRunner.query(`DROP TABLE "waitlist"`);
        await queryRunner.query(`DROP TYPE "public"."waitlist_status_enum"`);
        await queryRunner.query(`DROP TABLE "flight"`);
        await queryRunner.query(`DROP TYPE "public"."flight_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_seat_flight_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_seat_held_by"`);
        await queryRunner.query(`DROP TABLE "seat"`);
        await queryRunner.query(`DROP TYPE "public"."seat_status_enum"`);
        await queryRunner.query(`DROP TABLE "passenger"`);
        await queryRunner.query(`DROP TABLE "check_in"`);
        await queryRunner.query(`DROP TYPE "public"."check_in_status_enum"`);
        await queryRunner.query(`DROP TABLE "aircraft_type"`);
    }

}
