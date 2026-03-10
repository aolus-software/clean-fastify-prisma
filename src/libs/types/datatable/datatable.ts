import { SortDirection } from "./sort-direction";

export type DatatableType = {
	page: number;
	limit: number;
	search: string | null;
	sort: string;
	sortDirection: SortDirection;
	filter: Record<string, boolean | string | Date> | null;
};
