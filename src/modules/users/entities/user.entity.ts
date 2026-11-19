import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserRole } from '../enums/user-role.enum';

/**
 * Domain entity representing internal platform users (ADMIN, REVIEWER, SALES).
 *
 * Security Invariants:
 * - `passwordHash`: Configured with `select: false` so credential hashes are
 *   never returned in default queries or API serialization.
 * - `email`: Unique index enforces account uniqueness and accelerates login queries.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index({ unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: UserRole.SALES,
  })
  role!: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
