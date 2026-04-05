create table if not exists public."Sverigelistan" (
  "Gender" varchar(1) not null,
  "Rank" integer not null,
  "Name" varchar(100) not null,
  "RunnerId" integer null,
  "Club" varchar(100) not null,
  "ClubId" integer null,
  "Points" numeric(7,2) not null,
  "PageIndex" integer not null,
  "BirthYear" integer null,
  "Updated" date not null
);

create index if not exists "Sverigelistan_Updated_idx"
  on public."Sverigelistan" ("Updated");

create index if not exists "Sverigelistan_Gender_Rank_idx"
  on public."Sverigelistan" ("Gender", "Rank");
