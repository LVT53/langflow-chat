import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import DocumentsList from './DocumentsList.svelte';

const mockUploadedDocument = {
	id: 'doc-1',
	name: 'Budget.pdf',
	type: 'source_document',
	mimeType: 'application/pdf',
	sizeBytes: 1024 * 1024 * 2.5,
	createdAt: Date.now() - 86400000,
	vaultId: 'vault-1',
	vaultName: 'Research',
};

const mockGeneratedDocument = {
	id: 'doc-2',
	name: 'Report.docx',
	type: 'generated_output',
	mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	sizeBytes: 512 * 1024,
	createdAt: Date.now() - 172800000,
	conversationId: 'conv-1',
};

const mockDocuments = [
	mockUploadedDocument,
	mockGeneratedDocument,
	{
		id: 'doc-3',
		name: 'Analysis.xlsx',
		type: 'source_document',
		mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		sizeBytes: 1024 * 1024,
		createdAt: Date.now() - 259200000,
		vaultId: 'vault-2',
		vaultName: 'Ops',
	},
	{
		id: 'doc-4',
		name: 'Summary.txt',
		type: 'generated_output',
		mimeType: 'text/plain',
		sizeBytes: 1024,
		createdAt: Date.now() - 345600000,
		conversationId: 'conv-2',
	},
];

const manyDocuments = Array.from({ length: 150 }, (_, i) => ({
	id: `doc-${i}`,
	name: `File-${i}.pdf`,
	type: i % 2 === 0 ? 'source_document' : 'generated_output',
	mimeType: 'application/pdf',
	sizeBytes: 1024,
	createdAt: Date.now() - i * 1000,
}));

describe('DocumentsList', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Empty State', () => {
		it('renders empty state when no documents provided', () => {
			render(DocumentsList, {
				props: {
					documents: [],
				},
			});

			expect(screen.getByText(/no documents/i)).toBeInTheDocument();
			expect(screen.getByText(/upload or generate documents/i)).toBeInTheDocument();
		});

		it('renders empty state message for filter with no matches', () => {
			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					filter: 'generated',
				},
			});

			const uploadedFilter = screen.getByRole('radio', { name: /uploaded/i });
			fireEvent.click(uploadedFilter);
		});
	});

	describe('List Rendering', () => {
		it('renders list of documents with correct columns', () => {
			render(DocumentsList, {
				props: {
					documents: mockDocuments,
				},
			});

			expect(screen.getByText(/name/i)).toBeInTheDocument();
			expect(screen.getByText(/type/i)).toBeInTheDocument();
			expect(screen.getByText(/size/i)).toBeInTheDocument();
			expect(screen.getByText(/date/i)).toBeInTheDocument();
			expect(screen.getByText(/actions/i)).toBeInTheDocument();
		});

		it('renders document names correctly', () => {
			render(DocumentsList, {
				props: {
					documents: mockDocuments,
				},
			});

			expect(screen.getByText('Budget.pdf')).toBeInTheDocument();
			expect(screen.getByText('Report.docx')).toBeInTheDocument();
			expect(screen.getByText('Analysis.xlsx')).toBeInTheDocument();
			expect(screen.getByText('Summary.txt')).toBeInTheDocument();
		});

		it('renders type badges correctly', () => {
			render(DocumentsList, {
				props: {
					documents: mockDocuments,
				},
			});

			const rows = screen.getAllByRole('row').slice(1);

			expect(screen.getAllByText(/uploaded/i).length).toBeGreaterThan(0);
			expect(screen.getAllByText(/generated/i).length).toBeGreaterThan(0);
		});

		it('renders file sizes in human-readable format', () => {
			render(DocumentsList, {
				props: {
					documents: mockDocuments,
				},
			});

			expect(screen.getByText('2.5 MB')).toBeInTheDocument();
			expect(screen.getByText('512 KB')).toBeInTheDocument();
			expect(screen.getByText('1 MB')).toBeInTheDocument();
			expect(screen.getByText('1 KB')).toBeInTheDocument();
		});

		it('renders formatted dates', () => {
			render(DocumentsList, {
				props: {
					documents: mockDocuments,
				},
			});

			const dateCells = screen.getAllByRole('cell').filter(cell => {
				const text = cell.textContent || '';
				return /\d{1,2}/.test(text) && (text.includes(',') || text.includes('/') || text.includes('-'));
			});

			expect(dateCells.length).toBeGreaterThan(0);
		});

		it('renders file icons based on mime type', () => {
			render(DocumentsList, {
				props: {
					documents: mockDocuments,
				},
			});

			const icons = screen.getAllByTestId('file-icon');
			expect(icons.length).toBe(mockDocuments.length);
		});
	});

	describe('Filter Functionality', () => {
		it('filter "All" shows both uploaded and generated documents', () => {
			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					filter: 'all',
				},
			});

			const allFilter = screen.getByRole('radio', { name: /all/i });
			expect(allFilter).toBeChecked();

			expect(screen.getByText('Budget.pdf')).toBeInTheDocument();
			expect(screen.getByText('Report.docx')).toBeInTheDocument();
			expect(screen.getByText('Analysis.xlsx')).toBeInTheDocument();
			expect(screen.getByText('Summary.txt')).toBeInTheDocument();
		});

		it('filter "Uploaded" shows only source_document type documents', () => {
			const onFilterChange = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					filter: 'uploaded',
					onFilterChange,
				},
			});

			const uploadedFilter = screen.getByRole('radio', { name: /uploaded/i });
			expect(uploadedFilter).toBeChecked();

			expect(screen.getByText('Budget.pdf')).toBeInTheDocument();
			expect(screen.getByText('Analysis.xlsx')).toBeInTheDocument();
			expect(screen.queryByText('Report.docx')).toBeNull();
			expect(screen.queryByText('Summary.txt')).toBeNull();
		});

		it('filter "Generated" shows only generated_output type documents', () => {
			const onFilterChange = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					filter: 'generated',
					onFilterChange,
				},
			});

			const generatedFilter = screen.getByRole('radio', { name: /generated/i });
			expect(generatedFilter).toBeChecked();

			expect(screen.getByText('Report.docx')).toBeInTheDocument();
			expect(screen.getByText('Summary.txt')).toBeInTheDocument();
			expect(screen.queryByText('Budget.pdf')).toBeNull();
			expect(screen.queryByText('Analysis.xlsx')).toBeNull();
		});

		it('emits filter change event when filter is changed', async () => {
			const onFilterChange = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					filter: 'all',
					onFilterChange,
				},
			});

			const uploadedFilter = screen.getByRole('radio', { name: /uploaded/i });
			await fireEvent.click(uploadedFilter);

			expect(onFilterChange).toHaveBeenCalledWith('uploaded');
		});
	});

	describe('Pagination', () => {
		it('shows pagination controls when documents exceed limit', () => {
			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					paginationLimit: 20,
				},
			});

			expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
			expect(screen.getByText(/page 1 of/i)).toBeInTheDocument();
		});

		it('pagination limit 20 shows only 20 documents per page', () => {
			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					paginationLimit: 20,
				},
			});

			const rows = screen.getAllByRole('row').slice(1);
			expect(rows.length).toBe(20);
		});

		it('pagination limit 50 shows only 50 documents per page', () => {
			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					paginationLimit: 50,
				},
			});

			const rows = screen.getAllByRole('row').slice(1);
			expect(rows.length).toBe(50);
		});

		it('pagination limit 100 shows only 100 documents per page', () => {
			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					paginationLimit: 100,
				},
			});

			const rows = screen.getAllByRole('row').slice(1);
			expect(rows.length).toBe(100);
		});

		it('emits pagination limit change event', async () => {
			const onPaginationLimitChange = vi.fn();

			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					paginationLimit: 20,
					onPaginationLimitChange,
				},
			});

			const limitSelector = screen.getByRole('combobox', { name: /items per page/i });
			await fireEvent.change(limitSelector, { target: { value: '50' } });

			expect(onPaginationLimitChange).toHaveBeenCalledWith(50);
		});

		it('navigates to next page when next button clicked', async () => {
			const onPageChange = vi.fn();

			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					paginationLimit: 20,
					currentPage: 1,
					onPageChange,
				},
			});

			const nextButton = screen.getByRole('button', { name: /next page/i });
			await fireEvent.click(nextButton);

			expect(onPageChange).toHaveBeenCalledWith(2);
		});

		it('navigates to previous page when previous button clicked', async () => {
			const onPageChange = vi.fn();

			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					paginationLimit: 20,
					currentPage: 2,
					onPageChange,
				},
			});

			const prevButton = screen.getByRole('button', { name: /previous page/i });
			await fireEvent.click(prevButton);

			expect(onPageChange).toHaveBeenCalledWith(1);
		});
	});

	describe('Click Events', () => {
		it('emits select event with document data when row is clicked', async () => {
			const onSelect = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					onSelect,
				},
			});

			const row = screen.getByText('Budget.pdf').closest('tr');
			await fireEvent.click(row!);

			expect(onSelect).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'doc-1',
					name: 'Budget.pdf',
					type: 'source_document',
				})
			);
		});

		it('emits select event for generated documents', async () => {
			const onSelect = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					onSelect,
				},
			});

			const row = screen.getByText('Report.docx').closest('tr');
			await fireEvent.click(row!);

			expect(onSelect).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'doc-2',
					name: 'Report.docx',
					type: 'generated_output',
				})
			);
		});
	});

	describe('Delete Events', () => {
		it('emits delete event with correct document ID when delete button clicked', async () => {
			const onDelete = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					onDelete,
				},
			});

			const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
			await fireEvent.click(deleteButtons[0]);

			expect(onDelete).toHaveBeenCalledWith('doc-1');
		});

		it('emits delete event for generated documents', async () => {
			const onDelete = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					onDelete,
				},
			});

			const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
			await fireEvent.click(deleteButtons[1]);

			expect(onDelete).toHaveBeenCalledWith('doc-2');
		});

		it('prevents row click when delete button is clicked', async () => {
			const onSelect = vi.fn();
			const onDelete = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					onSelect,
					onDelete,
				},
			});

			const deleteButton = screen.getAllByRole('button', { name: /delete/i })[0];
			await fireEvent.click(deleteButton);

			expect(onSelect).not.toHaveBeenCalled();
			expect(onDelete).toHaveBeenCalledWith('doc-1');
		});
	});

	describe('Download Events', () => {
		it('emits download event with correct document ID when download button clicked', async () => {
			const onDownload = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					onDownload,
				},
			});

			const downloadButtons = screen.getAllByRole('button', { name: /download/i });
			await fireEvent.click(downloadButtons[0]);

			expect(onDownload).toHaveBeenCalledWith('doc-1');
		});

		it('emits download event for generated documents', async () => {
			const onDownload = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					onDownload,
				},
			});

			const downloadButtons = screen.getAllByRole('button', { name: /download/i });
			await fireEvent.click(downloadButtons[1]);

			expect(onDownload).toHaveBeenCalledWith('doc-2');
		});

		it('prevents row click when download button is clicked', async () => {
			const onSelect = vi.fn();
			const onDownload = vi.fn();

			render(DocumentsList, {
				props: {
					documents: mockDocuments,
					onSelect,
					onDownload,
				},
			});

			const downloadButton = screen.getAllByRole('button', { name: /download/i })[0];
			await fireEvent.click(downloadButton);

			expect(onSelect).not.toHaveBeenCalled();
			expect(onDownload).toHaveBeenCalledWith('doc-1');
		});
	});

	describe('Combined Interactions', () => {
		it('handles filter change with pagination reset', async () => {
			const onFilterChange = vi.fn();
			const onPageChange = vi.fn();

			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					filter: 'all',
					paginationLimit: 20,
					currentPage: 3,
					onFilterChange,
					onPageChange,
				},
			});

			const uploadedFilter = screen.getByRole('radio', { name: /uploaded/i });
			await fireEvent.click(uploadedFilter);

			expect(onFilterChange).toHaveBeenCalledWith('uploaded');
			expect(onPageChange).toHaveBeenCalledWith(1);
		});

		it('maintains filter when pagination limit changes', async () => {
			const onPaginationLimitChange = vi.fn();

			render(DocumentsList, {
				props: {
					documents: manyDocuments,
					filter: 'generated',
					paginationLimit: 20,
					onPaginationLimitChange,
				},
			});

			const generatedFilter = screen.getByRole('radio', { name: /generated/i });
			expect(generatedFilter).toBeChecked();

			const limitSelector = screen.getByRole('combobox', { name: /items per page/i });
			await fireEvent.change(limitSelector, { target: { value: '50' } });

			expect(onPaginationLimitChange).toHaveBeenCalledWith(50);
			expect(generatedFilter).toBeChecked();
		});
	});
});
