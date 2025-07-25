const path = require('path');
const { 
  buildModelToDomainMapping, 
  extractModuleFromPath, 
  isPrismaModelName, 
  camelToPascalCase 
} = require('../../lib/utils/schema-parser');

describe('schema-parser', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/schema');

  describe('buildModelToDomainMapping', () => {
    it('should map models to their domain files', () => {
      const mapping = buildModelToDomainMapping(fixturesDir);
      
      expect(mapping).toEqual({
        'User': 'auth',
        'Session': 'auth',
        'Organization': 'organization', 
        'Membership': 'organization',
        'AuditLog': 'shared',
        'Setting': 'shared'
      });
    });

    it('should handle non-existent directories gracefully', () => {
      const mapping = buildModelToDomainMapping('/non/existent/path');
      expect(mapping).toEqual({});
    });
  });

  describe('extractModuleFromPath', () => {
    it('should extract module name from Unix paths', () => {
      expect(extractModuleFromPath('/app/modules/auth/service.ts')).toBe('auth');
      expect(extractModuleFromPath('/src/modules/organization/controller.ts')).toBe('organization');
      expect(extractModuleFromPath('/modules/user-management/index.ts')).toBe('user-management');
    });

    it('should extract module name from Windows paths', () => {
      expect(extractModuleFromPath('C:\\app\\modules\\auth\\service.ts')).toBe('auth');
      expect(extractModuleFromPath('C:\\src\\modules\\organization\\controller.ts')).toBe('organization');
    });

    it('should return null for non-module paths', () => {
      expect(extractModuleFromPath('/app/src/service.ts')).toBeNull();
      expect(extractModuleFromPath('/lib/utils/helper.ts')).toBeNull();
      expect(extractModuleFromPath('service.ts')).toBeNull();
    });

    it('should handle nested module structures', () => {
      expect(extractModuleFromPath('/app/src/modules/auth/services/user.service.ts')).toBe('auth');
      expect(extractModuleFromPath('/modules/organization/dto/create-org.dto.ts')).toBe('organization');
    });
  });

  describe('isPrismaModelName', () => {
    it('should accept valid model names', () => {
      expect(isPrismaModelName('User')).toBe(true);
      expect(isPrismaModelName('Organization')).toBe(true);
      expect(isPrismaModelName('userProfile')).toBe(true);
      expect(isPrismaModelName('ApiKey')).toBe(true);
      expect(isPrismaModelName('OAuthToken')).toBe(true);
    });

    it('should reject common method names', () => {
      expect(isPrismaModelName('findMany')).toBe(false);
      expect(isPrismaModelName('findFirst')).toBe(false);
      expect(isPrismaModelName('create')).toBe(false);
      expect(isPrismaModelName('update')).toBe(false);
      expect(isPrismaModelName('delete')).toBe(false);
      expect(isPrismaModelName('count')).toBe(false);
    });

    it('should reject common property names', () => {
      expect(isPrismaModelName('length')).toBe(false);
      expect(isPrismaModelName('constructor')).toBe(false);
      expect(isPrismaModelName('prototype')).toBe(false);
      expect(isPrismaModelName('toString')).toBe(false);
    });

    it('should reject invalid formats', () => {
      expect(isPrismaModelName('a')).toBe(false); // Too short
      expect(isPrismaModelName('123')).toBe(false); // Starts with number
      expect(isPrismaModelName('USER')).toBe(false); // All uppercase
      expect(isPrismaModelName('user-name')).toBe(false); // Contains hyphen
      expect(isPrismaModelName('user_name')).toBe(false); // Contains underscore
    });

    it('should accept mixed case names', () => {
      expect(isPrismaModelName('UserProfile')).toBe(true);
      expect(isPrismaModelName('userProfile')).toBe(true);
      expect(isPrismaModelName('APIKey')).toBe(true);
    });
  });

  describe('camelToPascalCase', () => {
    it('should convert camelCase to PascalCase', () => {
      expect(camelToPascalCase('user')).toBe('User');
      expect(camelToPascalCase('userProfile')).toBe('UserProfile');
      expect(camelToPascalCase('apiKey')).toBe('ApiKey');
      expect(camelToPascalCase('oAuthToken')).toBe('OAuthToken');
    });

    it('should handle already PascalCase strings', () => {
      expect(camelToPascalCase('User')).toBe('User');
      expect(camelToPascalCase('UserProfile')).toBe('UserProfile');
      expect(camelToPascalCase('APIKey')).toBe('APIKey');
    });

    it('should handle single characters', () => {
      expect(camelToPascalCase('a')).toBe('A');
      expect(camelToPascalCase('x')).toBe('X');
    });

    it('should handle empty strings', () => {
      expect(camelToPascalCase('')).toBe('');
    });
  });
});