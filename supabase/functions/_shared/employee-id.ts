type EmployeeIdClient = {
  rpc(name: "generate_employee_id"): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Use the database's atomic allocator; never read and rewrite the counter. */
export async function allocateEmployeeId(client: EmployeeIdClient): Promise<string> {
  const { data, error } = await client.rpc("generate_employee_id");
  if (error || typeof data !== "string" || !/^EMP-\d+$/.test(data)) {
    throw new Error("Employee ID allocation failed");
  }
  return data;
}
