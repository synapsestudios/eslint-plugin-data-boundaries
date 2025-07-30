import { sql, DatabasePool } from 'slonik';

// This file tests real slonik usage patterns to ensure our rule works correctly

class AuthService {
  constructor(private pool: DatabasePool) {}

  // Valid: Using fully qualified schema names
  async getUserById(id: string) {
    return await this.pool.query(sql`
      SELECT * FROM auth.users WHERE id = ${id}
    `);
  }

  async getUserSessions(userId: string) {
    return await this.pool.query(sql`
      SELECT s.* FROM auth.sessions s
      JOIN auth.users u ON s.user_id = u.id
      WHERE u.id = ${userId}
    `);
  }

  // Invalid: Using unqualified table names (should trigger rule)
  async getUnqualifiedUser(id: string) {
    return await this.pool.query(sql`
      SELECT * FROM users WHERE id = ${id}
    `);
  }

  // Invalid: Cross-schema access (should trigger rule)
  async getCrossSchemaData(userId: string) {
    return await this.pool.query(sql`
      SELECT * FROM organization.memberships WHERE user_id = ${userId}
    `);
  }

  // Test complex SQL with multiple violations
  async complexQuery(orgId: string) {
    return await this.pool.query(sql`
      SELECT 
        u.email,
        o.name as org_name,
        COUNT(*) as session_count
      FROM users u
      JOIN organization.memberships m ON u.id = m.user_id
      JOIN organization.organizations o ON m.organization_id = o.id
      WHERE o.id = ${orgId}
      GROUP BY u.id, o.id
    `);
  }
}

export { AuthService };
