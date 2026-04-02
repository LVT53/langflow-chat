import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import VaultSidebar from './VaultSidebar.svelte';
import type { Vault } from '$lib/server/services/knowledge/store';
import { uploadKnowledgeAttachment } from '$lib/client/api/knowledge';

// Mock Svelte transitions for jsdom
vi.mock('svelte/transition', () => ({
	fade: () => ({
		delay: 0,
		duration: 0,
		css: () => '',
	}),
	scale: () => ({
		delay: 0,
		duration: 0,
		css: () => '',
	}),
}));

// Mock the vault store module
vi.mock('$lib/server/services/knowledge/store', () => ({
  Vault: {} as any,
  VaultUpdates: {} as any,
}));

vi.mock('$lib/client/api/knowledge', () => ({
	uploadKnowledgeAttachment: vi.fn(),
}));

describe('VaultSidebar', () => {
  const mockUploadKnowledgeAttachment = uploadKnowledgeAttachment as ReturnType<typeof vi.fn>;
  const mockVaults: Vault[] = [
    {
      id: 'vault-1',
      userId: 'user-1',
      name: 'Personal',
      color: '#C15F3C',
      sortOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'vault-2',
      userId: 'user-1',
      name: 'Work',
      color: '#3B82F6',
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'vault-3',
      userId: 'user-1',
      name: 'Projects',
      color: null,
      sortOrder: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const defaultProps = {
    vaults: mockVaults,
    activeVaultId: null as string | null,
    conversationId: null as string | null,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadKnowledgeAttachment.mockResolvedValue({
      artifact: { id: 'artifact-1', name: 'doc.pdf' },
    });
  });

  function createFileDrop(files: File[]) {
    return {
      dataTransfer: {
        types: ['Files'],
        files,
        dropEffect: 'copy',
      },
    };
  }

  describe('Rendering', () => {
    it('renders vault list with all vaults', () => {
      render(VaultSidebar, { props: defaultProps });

      expect(screen.getByText('Personal')).toBeInTheDocument();
      expect(screen.getByText('Work')).toBeInTheDocument();
      expect(screen.getByText('Projects')).toBeInTheDocument();
    });

    it('renders empty state when no vaults', () => {
      render(VaultSidebar, {
        props: { ...defaultProps, vaults: [] },
      });

      expect(screen.getByText('No vaults yet')).toBeInTheDocument();
      expect(screen.getByText('Create your first vault to organize files')).toBeInTheDocument();
    });

    it('renders create button', () => {
      render(VaultSidebar, { props: defaultProps });

      expect(screen.getByLabelText('Create new vault')).toBeInTheDocument();
    });

    it('displays vault colors', () => {
      render(VaultSidebar, { props: defaultProps });

      const colorIndicators = screen.getAllByTestId('vault-color-indicator');
      expect(colorIndicators).toHaveLength(3);
    });
  });

  describe('Active Vault Selection', () => {
    it('highlights active vault', () => {
      render(VaultSidebar, {
        props: { ...defaultProps, activeVaultId: 'vault-1' },
      });

      const activeVault = screen.getByTestId('vault-item-vault-1');
      expect(activeVault).toHaveAttribute('data-active', 'true');
    });

    it('does not highlight inactive vaults', () => {
      render(VaultSidebar, {
        props: { ...defaultProps, activeVaultId: 'vault-1' },
      });

      const inactiveVault = screen.getByTestId('vault-item-vault-2');
      expect(inactiveVault).toHaveAttribute('data-active', 'false');
    });

    it('calls onSelect when clicking a vault', async () => {
      const onSelect = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onSelect },
      });

      const vaultItem = screen.getByTestId('vault-item-vault-1');
      await fireEvent.click(vaultItem);

      expect(onSelect).toHaveBeenCalledWith({ id: 'vault-1' });
    });
  });

  describe('Create Vault', () => {
    it('opens create modal when clicking create button', async () => {
      render(VaultSidebar, { props: defaultProps });

      const createButton = screen.getByLabelText('Create new vault');
      await fireEvent.click(createButton);

      expect(screen.getByTestId('create-vault-modal')).toBeInTheDocument();
      expect(screen.getByText('Create New Vault')).toBeInTheDocument();
    });

    it('calls onCreate with name and color when form submitted', async () => {
      const onCreate = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onCreate },
      });

      // Open modal
      const createButton = screen.getByLabelText('Create new vault');
      await fireEvent.click(createButton);

      // Fill in name
      const nameInput = screen.getByLabelText('Vault name');
      await fireEvent.input(nameInput, { target: { value: 'New Vault' } });

      // Submit form
      const submitButton = screen.getByTestId('create-vault-submit');
      await fireEvent.click(submitButton);

      expect(onCreate).toHaveBeenCalledWith({
        name: 'New Vault',
        color: expect.any(String),
      });
    });

    it('closes modal on cancel', async () => {
      render(VaultSidebar, { props: defaultProps });

      // Open modal
      const createButton = screen.getByLabelText('Create new vault');
      await fireEvent.click(createButton);

      // Cancel
      const cancelButton = screen.getByTestId('create-vault-cancel');
      await fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByTestId('create-vault-modal')).not.toBeInTheDocument();
      });
    });

    it('closes modal on Escape key', async () => {
      render(VaultSidebar, { props: defaultProps });

      // Open modal
      const createButton = screen.getByLabelText('Create new vault');
      await fireEvent.click(createButton);

      // Press Escape
      await fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('create-vault-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('Inline Rename', () => {
    it('enters edit mode when clicking vault name', async () => {
      render(VaultSidebar, { props: defaultProps });

      const vaultName = screen.getByTestId('vault-name-vault-1');
      await fireEvent.click(vaultName);

      expect(screen.getByTestId('vault-rename-input-vault-1')).toBeInTheDocument();
    });

    it('saves rename on Enter key', async () => {
      const onRename = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onRename },
      });

      // Enter edit mode
      const vaultName = screen.getByTestId('vault-name-vault-1');
      await fireEvent.click(vaultName);

      // Type new name
      const input = screen.getByTestId('vault-rename-input-vault-1');
      await fireEvent.input(input, { target: { value: 'Renamed Vault' } });
      await fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRename).toHaveBeenCalledWith({
        id: 'vault-1',
        name: 'Renamed Vault',
      });
    });

    it('cancels rename on Escape key', async () => {
      const onRename = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onRename },
      });

      // Enter edit mode
      const vaultName = screen.getByTestId('vault-name-vault-1');
      await fireEvent.click(vaultName);

      // Press Escape
      const input = screen.getByTestId('vault-rename-input-vault-1');
      await fireEvent.keyDown(input, { key: 'Escape' });

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByTestId('vault-rename-input-vault-1')).not.toBeInTheDocument();
    });

    it('saves rename on blur', async () => {
      const onRename = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onRename },
      });

      // Enter edit mode
      const vaultName = screen.getByTestId('vault-name-vault-1');
      await fireEvent.click(vaultName);

      // Type new name and blur
      const input = screen.getByTestId('vault-rename-input-vault-1');
      await fireEvent.input(input, { target: { value: 'Renamed Vault' } });
      await fireEvent.blur(input);

      expect(onRename).toHaveBeenCalledWith({
        id: 'vault-1',
        name: 'Renamed Vault',
      });
    });

    it('does not save if name is unchanged', async () => {
      const onRename = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onRename },
      });

      // Enter edit mode
      const vaultName = screen.getByTestId('vault-name-vault-1');
      await fireEvent.click(vaultName);

      // Just blur without changing
      const input = screen.getByTestId('vault-rename-input-vault-1');
      await fireEvent.blur(input);

      expect(onRename).not.toHaveBeenCalled();
    });

    it('does not save if name is empty', async () => {
      const onRename = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onRename },
      });

      // Enter edit mode
      const vaultName = screen.getByTestId('vault-name-vault-1');
      await fireEvent.click(vaultName);

      // Clear name and blur
      const input = screen.getByTestId('vault-rename-input-vault-1');
      await fireEvent.input(input, { target: { value: '' } });
      await fireEvent.blur(input);

      expect(onRename).not.toHaveBeenCalled();
    });
  });

  describe('Delete Vault', () => {
    it('shows delete button on vault hover', () => {
      render(VaultSidebar, { props: defaultProps });

      const vaultItem = screen.getByTestId('vault-item-vault-1');
      const deleteButton = screen.getByTestId('vault-delete-btn-vault-1');

      // Delete button should exist (hidden by default, shown on hover via CSS)
      expect(deleteButton).toBeInTheDocument();
    });

    it('opens delete confirmation dialog when clicking delete', async () => {
      render(VaultSidebar, { props: defaultProps });

      const deleteButton = screen.getByTestId('vault-delete-btn-vault-1');
      await fireEvent.click(deleteButton);

      expect(screen.getByTestId('delete-vault-dialog')).toBeInTheDocument();
      expect(screen.getByText('Delete vault?')).toBeInTheDocument();
    });

    it('shows file count in delete dialog', async () => {
      render(VaultSidebar, { props: defaultProps });

      const deleteButton = screen.getByTestId('vault-delete-btn-vault-1');
      await fireEvent.click(deleteButton);

      expect(screen.getByText(/0 files/)).toBeInTheDocument();
    });

    it('calls onDelete when confirming deletion', async () => {
      const onDelete = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onDelete },
      });

      // Open delete dialog
      const deleteButton = screen.getByTestId('vault-delete-btn-vault-1');
      await fireEvent.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByTestId('delete-vault-confirm');
      await fireEvent.click(confirmButton);

      expect(onDelete).toHaveBeenCalledWith({ id: 'vault-1' });
    });

    it('closes dialog on cancel', async () => {
      render(VaultSidebar, { props: defaultProps });

      // Open delete dialog
      const deleteButton = screen.getByTestId('vault-delete-btn-vault-1');
      await fireEvent.click(deleteButton);

      // Cancel
      const cancelButton = screen.getByTestId('delete-vault-cancel');
      await fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByTestId('delete-vault-dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Drag And Drop Upload', () => {
    it('shows the drag overlay during OS file drags', async () => {
      render(VaultSidebar, { props: defaultProps });

      const sidebar = screen.getByLabelText('Vault sidebar');
      await fireEvent.dragEnter(
        sidebar,
        createFileDrop([new File(['doc'], 'doc.pdf', { type: 'application/pdf' })])
      );

      expect(screen.getByTestId('vault-drop-overlay')).toBeInTheDocument();
    });

    it('uploads dropped files to the hovered vault from the sidebar drop target', async () => {
      const onSelect = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onSelect },
      });

      const file = new File(['doc'], 'doc.pdf', { type: 'application/pdf' });
      const sidebar = screen.getByLabelText('Vault sidebar');
      const vaultItem = screen.getByTestId('vault-item-vault-2');

      await fireEvent.dragEnter(sidebar, createFileDrop([file]));
      await fireEvent.drop(vaultItem, createFileDrop([file]));

      await waitFor(() => {
        expect(mockUploadKnowledgeAttachment).toHaveBeenCalledWith(file, null, 'vault-2');
      });
      expect(onSelect).toHaveBeenCalledWith({ id: 'vault-2' });
    });

    it('falls back to the active vault when files are dropped on the sidebar chrome', async () => {
      render(VaultSidebar, {
        props: { ...defaultProps, activeVaultId: 'vault-1' },
      });

      const file = new File(['doc'], 'doc.pdf', { type: 'application/pdf' });
      const sidebar = screen.getByLabelText('Vault sidebar');

      await fireEvent.dragEnter(sidebar, createFileDrop([file]));
      await fireEvent.drop(sidebar, createFileDrop([file]));

      await waitFor(() => {
        expect(mockUploadKnowledgeAttachment).toHaveBeenCalledWith(file, null, 'vault-1');
      });
    });

    it('shows a helpful error when files are dropped without any vaults', async () => {
      render(VaultSidebar, {
        props: { ...defaultProps, vaults: [] },
      });

      const file = new File(['doc'], 'doc.pdf', { type: 'application/pdf' });
      const sidebar = screen.getByLabelText('Vault sidebar');

      await fireEvent.dragEnter(sidebar, createFileDrop([file]));
      await fireEvent.drop(sidebar, createFileDrop([file]));

      expect(mockUploadKnowledgeAttachment).not.toHaveBeenCalled();
      expect(screen.getByTestId('upload-error')).toHaveTextContent(/create a vault before dropping files/i);
    });
  });

  describe('Color Picker', () => {
    it('shows preset colors in create modal', async () => {
      render(VaultSidebar, { props: defaultProps });

      // Open modal
      const createButton = screen.getByLabelText('Create new vault');
      await fireEvent.click(createButton);

      const colorOptions = screen.getAllByTestId('color-option');
      expect(colorOptions.length).toBeGreaterThan(0);
    });

    it('allows selecting a preset color', async () => {
      const onCreate = vi.fn();
      render(VaultSidebar, {
        props: { ...defaultProps, onCreate },
      });

      // Open modal
      const createButton = screen.getByLabelText('Create new vault');
      await fireEvent.click(createButton);

      // Select a color
      const colorOptions = screen.getAllByTestId('color-option');
      await fireEvent.click(colorOptions[2]); // Select third color

      // Fill in name and submit
      const nameInput = screen.getByLabelText('Vault name');
      await fireEvent.input(nameInput, { target: { value: 'Colored Vault' } });

      const submitButton = screen.getByTestId('create-vault-submit');
      await fireEvent.click(submitButton);

      expect(onCreate).toHaveBeenCalledWith({
        name: 'Colored Vault',
        color: expect.any(String),
      });
    });

    it('shows custom hex input', async () => {
      render(VaultSidebar, { props: defaultProps });

      // Open modal
      const createButton = screen.getByLabelText('Create new vault');
      await fireEvent.click(createButton);

      expect(screen.getByLabelText('Custom color (hex)')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('vault items have correct ARIA attributes', () => {
      render(VaultSidebar, {
        props: { ...defaultProps, activeVaultId: 'vault-1' },
      });

      const vaultItem = screen.getByTestId('vault-item-vault-1');
      expect(vaultItem).toHaveAttribute('role', 'button');
      expect(vaultItem).toHaveAttribute('tabindex', '0');
      expect(vaultItem).toHaveAttribute('aria-pressed', 'true');
    });

    it('inactive vault has aria-pressed false', () => {
      render(VaultSidebar, {
        props: { ...defaultProps, activeVaultId: 'vault-1' },
      });

      const vaultItem = screen.getByTestId('vault-item-vault-2');
      expect(vaultItem).toHaveAttribute('aria-pressed', 'false');
    });

    it('create button has correct ARIA label', () => {
      render(VaultSidebar, { props: defaultProps });

      expect(screen.getByLabelText('Create new vault')).toBeInTheDocument();
    });

    it('delete button has correct ARIA label', () => {
      render(VaultSidebar, { props: defaultProps });

      expect(screen.getByLabelText('Delete Personal vault')).toBeInTheDocument();
    });
  });
});
