import { basename, dirname, extname, relative } from 'path';

/**
 * Generate Jest test.
 */
function generateJestTest(componentName, sourcePath, analysis, _options) {
  const isReactComponent = sourcePath.includes('component') || sourcePath.match(/\.(tsx|jsx)$/);
  const importPath = './' + basename(sourcePath, extname(sourcePath));

  let content = '';

  if (isReactComponent) {
    content += `import { render, screen, waitFor, fireEvent } from '@testing-library/react'\n`;
    content += `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'\n`;
  } else {
    content += `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'\n`;
  }

  if (analysis.exports.length > 0) {
    content += `import { ${analysis.exports.join(', ')} } from '${importPath}'\n\n`;
  }

  content += `describe('${componentName}', () => {\n`;
  content += `  beforeEach(() => {\n`;
  content += `    vi.clearAllMocks()\n`;
  content += `  })\n\n`;

  const testCases = [];

  if (isReactComponent && analysis.exports.length > 0) {
    const mainExport = analysis.exports[0];

    testCases.push({
      name: 'renders without crashing',
      type: 'unit',
      coverage_target: 'basic',
      assertions: 1,
    });
    content += `  it('renders without crashing', () => {\n`;
    content += `    render(<${mainExport} />)\n`;
    content += `    expect(screen.getByRole('main')).toBeInTheDocument()\n`;
    content += `  })\n\n`;

    testCases.push({
      name: 'renders with props',
      type: 'unit',
      coverage_target: 'props',
      assertions: 2,
    });
    content += `  it('renders with props', () => {\n`;
    content += `    const props = { title: 'Test Title' }\n`;
    content += `    render(<${mainExport} {...props} />)\n`;
    content += `    expect(screen.getByText('Test Title')).toBeInTheDocument()\n`;
    content += `  })\n\n`;

    testCases.push({
      name: 'handles user interactions',
      type: 'integration',
      coverage_target: 'interactions',
      assertions: 2,
    });
    content += `  it('handles user interactions', async () => {\n`;
    content += `    render(<${mainExport} />)\n`;
    content += `    const button = screen.getByRole('button')\n`;
    content += `    fireEvent.click(button)\n`;
    content += `    await waitFor(() => {\n`;
    content += `      expect(screen.getByText(/clicked/i)).toBeInTheDocument()\n`;
    content += `    })\n`;
    content += `  })\n\n`;

    testCases.push({
      name: 'handles error state',
      type: 'unit',
      coverage_target: 'error_handling',
      assertions: 1,
    });
    content += `  it('handles error state', () => {\n`;
    content += `    render(<${mainExport} error="Something went wrong" />)\n`;
    content += `    expect(screen.getByText('Something went wrong')).toBeInTheDocument()\n`;
    content += `  })\n\n`;
  } else {
    analysis.functions.forEach(funcName => {
      testCases.push({
        name: `${funcName} - happy path`,
        type: 'unit',
        coverage_target: 'happy_path',
        assertions: 1,
      });
      content += `  it('${funcName} - happy path', () => {\n`;
      content += `    const result = ${funcName}(/* valid input */)\n`;
      content += `    expect(result).toBeDefined()\n`;
      content += `  })\n\n`;

      testCases.push({
        name: `${funcName} - handles edge cases`,
        type: 'unit',
        coverage_target: 'edge_cases',
        assertions: 2,
      });
      content += `  it('${funcName} - handles edge cases', () => {\n`;
      content += `    expect(() => ${funcName}(null)).not.toThrow()\n`;
      content += `    expect(${funcName}(undefined)).toBeDefined()\n`;
      content += `  })\n\n`;
    });
  }

  content += `})\n`;

  return { content, testCases };
}

/**
 * Generate Vitest test (similar to Jest).
 */
function generateVitestTest(componentName, sourcePath, analysis, options) {
  return generateJestTest(componentName, sourcePath, analysis, options);
}

/**
 * Generate Cypress test.
 */
function generateCypressTest(componentName, _sourcePath, _analysis, _options) {
  const testCases = [];
  let content = `describe('${componentName} E2E Tests', () => {\n`;
  content += `  beforeEach(() => {\n`;
  content += `    cy.visit('/')\n`;
  content += `  })\n\n`;

  testCases.push({
    name: 'page loads successfully',
    type: 'e2e',
    coverage_target: 'page_load',
    assertions: 1,
  });
  content += `  it('page loads successfully', () => {\n`;
  content += `    cy.url().should('include', '/')\n`;
  content += `    cy.get('[data-testid="main"]').should('be.visible')\n`;
  content += `  })\n\n`;

  testCases.push({
    name: 'user can interact with UI',
    type: 'e2e',
    coverage_target: 'user_interaction',
    assertions: 2,
  });
  content += `  it('user can interact with UI', () => {\n`;
  content += `    cy.get('[data-testid="button"]').click()\n`;
  content += `    cy.get('[data-testid="result"]').should('be.visible')\n`;
  content += `  })\n\n`;

  testCases.push({
    name: 'form submission works',
    type: 'e2e',
    coverage_target: 'form_submission',
    assertions: 2,
  });
  content += `  it('form submission works', () => {\n`;
  content += `    cy.get('[data-testid="input"]').type('test value')\n`;
  content += `    cy.get('[data-testid="submit"]').click()\n`;
  content += `    cy.get('[data-testid="success"]').should('contain', 'Success')\n`;
  content += `  })\n\n`;

  content += `})\n`;

  return { content, testCases };
}

/**
 * Generate Playwright test.
 */
function generatePlaywrightTest(componentName, _sourcePath, _analysis, _options) {
  const testCases = [];
  let content = `import { test, expect } from '@playwright/test'\n\n`;
  content += `test.describe('${componentName}', () => {\n`;

  testCases.push({
    name: 'navigates to page',
    type: 'e2e',
    coverage_target: 'navigation',
    assertions: 1,
  });
  content += `  test('navigates to page', async ({ page }) => {\n`;
  content += `    await page.goto('/')\n`;
  content += `    await expect(page).toHaveURL(/.*\\//)\n`;
  content += `  })\n\n`;

  testCases.push({
    name: 'handles user interaction',
    type: 'e2e',
    coverage_target: 'interaction',
    assertions: 2,
  });
  content += `  test('handles user interaction', async ({ page }) => {\n`;
  content += `    await page.goto('/')\n`;
  content += `    await page.click('[data-testid="button"]')\n`;
  content += `    await expect(page.locator('[data-testid="result"]')).toBeVisible()\n`;
  content += `  })\n\n`;

  testCases.push({
    name: 'meets accessibility standards',
    type: 'e2e',
    coverage_target: 'accessibility',
    assertions: 1,
  });
  content += `  test('meets accessibility standards', async ({ page }) => {\n`;
  content += `    await page.goto('/')\n`;
  content += `    // Add accessibility checks here\n`;
  content += `    await expect(page.locator('main')).toBeVisible()\n`;
  content += `  })\n\n`;

  content += `})\n`;

  return { content, testCases };
}

/**
 * Generate Pytest test.
 */
function generatePytestTest(componentName, sourcePath, analysis, _options) {
  const testCases = [];
  const importPath = relative(dirname(sourcePath), sourcePath)
    .replace(/\.py$/, '')
    .replace(/\//g, '.');

  let content = `"""Tests for ${componentName}."""\n`;
  content += `import pytest\n`;

  if (analysis.exports.length > 0) {
    content += `from ${importPath} import ${analysis.exports.join(', ')}\n\n`;
  }

  content += `@pytest.fixture\n`;
  content += `def sample_data():\n`;
  content += `    """Provide sample test data."""\n`;
  content += `    return {"test": "data"}\n\n`;

  analysis.functions.forEach(funcName => {
    if (funcName.startsWith('_')) return;

    testCases.push({
      name: `test_${funcName}_happy_path`,
      type: 'unit',
      coverage_target: 'happy_path',
      assertions: 1,
    });
    content += `def test_${funcName}_happy_path(sample_data):\n`;
    content += `    """Test ${funcName} with valid input."""\n`;
    content += `    result = ${funcName}(sample_data)\n`;
    content += `    assert result is not None\n\n`;

    testCases.push({
      name: `test_${funcName}_edge_cases`,
      type: 'unit',
      coverage_target: 'edge_cases',
      assertions: 2,
    });
    content += `def test_${funcName}_edge_cases():\n`;
    content += `    """Test ${funcName} with edge cases."""\n`;
    content += `    with pytest.raises(ValueError):\n`;
    content += `        ${funcName}(None)\n`;
    content += `    assert ${funcName}({}) is not None\n\n`;
  });

  analysis.classes.forEach(className => {
    testCases.push({
      name: `test_${className}_initialization`,
      type: 'unit',
      coverage_target: 'initialization',
      assertions: 1,
    });
    content += `def test_${className}_initialization():\n`;
    content += `    """Test ${className} initialization."""\n`;
    content += `    instance = ${className}()\n`;
    content += `    assert instance is not None\n\n`;
  });

  return { content, testCases };
}

export {
  generateCypressTest,
  generateJestTest,
  generatePlaywrightTest,
  generatePytestTest,
  generateVitestTest,
};
