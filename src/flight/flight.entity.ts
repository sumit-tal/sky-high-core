import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { AircraftType } from "../aircraft-type/aircraft-type.entity";
import { FlightStatus } from "../common/types/enums";
import { Seat } from "../seat/seat.entity";
import { CheckIn } from "../check-in/check-in.entity";
import { Waitlist } from "../waitlist/waitlist.entity";

@Entity("flight")
export class Flight {
  @PrimaryGeneratedColumn("uuid")
  readonly id!: string;

  @Column({ name: "flight_number", type: "varchar", length: 10 })
  readonly flightNumber!: string;

  @Column({ name: "aircraft_type_id", type: "uuid" })
  readonly aircraftTypeId!: string;

  @ManyToOne(() => AircraftType, (aircraftType) => aircraftType.flights)
  @JoinColumn({ name: "aircraft_type_id" })
  readonly aircraftType!: AircraftType;

  @Column({ name: "departure_time", type: "timestamptz" })
  readonly departureTime!: Date;

  @Column({
    type: "enum",
    enum: FlightStatus,
    default: FlightStatus.SCHEDULED,
  })
  readonly status!: FlightStatus;

  @OneToMany(() => Seat, (seat) => seat.flight)
  readonly seats!: Seat[];

  @OneToMany(() => CheckIn, (checkIn) => checkIn.flight)
  readonly checkIns!: CheckIn[];

  @OneToMany(() => Waitlist, (waitlist) => waitlist.flight)
  readonly waitlistEntries!: Waitlist[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  readonly createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  readonly updatedAt!: Date;
}
