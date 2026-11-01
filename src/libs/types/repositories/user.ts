import type { UserStatus } from "@prisma-generated";

export type UserStatusEnum = UserStatus;

export interface UserInformation {
	id: string;
	name: string;
	email: string;
	roles: string[];
	permissions: string[];
}

export type UserList = {
	id: string;
	name: string;
	email: string;
	status: UserStatusEnum;
	remark: string | null;
	roles: string[];
	createdAt: Date;
	updatedAt: Date;
};

export type UserDetail = {
	id: string;
	name: string;
	email: string;
	status: UserStatusEnum;
	remark: string | null;
	roles: {
		id: string;
		name: string;
	}[];
	createdAt: Date;
	updatedAt: Date;
};

export type UserCreate = {
	name: string;
	email: string;
	password: string;
	status: UserStatusEnum;
	remark: string | null;
	roleIds: string[];
};

export type UserUpdate = Omit<UserCreate, "password">;

export type UserForAuth = {
	id: string;
	name: string;
	email: string;
	password: string;
	status: UserStatusEnum;
	emailVerifiedAt: Date | null;
};
