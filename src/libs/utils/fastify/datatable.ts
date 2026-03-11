import { DatatableType, SortDirection } from "@types";
import { FastifyRequest } from "fastify";

import { paginationLength } from "@/libs/fastify/default/pagination-length";
import { defaultSort } from "@/libs/fastify/default/sort";

export class DatatableToolkit {
	static parseFilter(request: FastifyRequest): DatatableType {
		const query = request.query as Record<string, string>;

		const page: number = query.page ? parseInt(query.page, 10) : 1;
		const perPage: number = query.perPage ? parseInt(query.perPage, 10) : paginationLength;
		const search: string | null = query.search ? query.search : null;
		const orderBy: string = query.sort ? query.sort : defaultSort;
		const orderDirection: SortDirection = query.sortDirection
			? (query.sortDirection as SortDirection)
			: "desc";

		const filter: Record<string, boolean | string | Date> = {};
		for (const key in query) {
			if (key.startsWith("filter[")) {
				const filterKey = key.slice(7, -1);
				const value = query[key];
				if (value === "true") filter[filterKey] = true;
				else if (value === "false") filter[filterKey] = false;
				else if (!isNaN(Date.parse(value))) filter[filterKey] = new Date(value);
				else filter[filterKey] = value;
			}
		}

		return {
			page,
			limit: perPage,
			search,
			sort: orderBy,
			sortDirection: orderDirection,
			filter: Object.keys(filter).length ? filter : null,
		};
	}
}
