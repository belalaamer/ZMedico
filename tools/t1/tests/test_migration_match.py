#!/usr/bin/env python3
"""Statement-boundary and token-preservation tests for the T1 matcher."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import migration_match as mm  # noqa: E402


class SplitStatementsTests(unittest.TestCase):
    def test_multiple_statements(self):
        self.assertEqual(mm.split_statements("SELECT 1; SELECT 2;"), ["SELECT 1", "SELECT 2"])

    def test_semicolon_in_string_is_not_a_boundary(self):
        self.assertEqual(len(mm.split_statements("SELECT 'a;b'; SELECT 2;")), 2)
        self.assertEqual(len(mm.split_statements("SELECT 'a;b';")), 1)

    def test_semicolon_in_quoted_identifier_is_not_a_boundary(self):
        self.assertEqual(len(mm.split_statements('SELECT "a;b"; SELECT 2;')), 2)

    def test_semicolon_in_comment_is_not_a_boundary(self):
        self.assertEqual(len(mm.split_statements("SELECT 1; -- ; DROP\n SELECT 2;")), 2)
        self.assertEqual(mm.split_statements("-- only ; a comment\n;"), [])

    def test_semicolon_in_dollar_body_is_not_a_boundary(self):
        sql = "CREATE FUNCTION f() RETURNS void AS $$ BEGIN PERFORM 1; PERFORM 2; END; $$ LANGUAGE plpgsql; SELECT 3;"
        self.assertEqual(len(mm.split_statements(sql)), 2)

    def test_semicolon_in_escape_string_is_not_a_boundary(self):
        sql = r"SELECT E'it\'s; ok'; SELECT 2;"
        self.assertEqual(len(mm.split_statements(sql)), 2)

    def test_semicolon_in_double_quoted_identifier_after_escape_like_text(self):
        sql = 'SELECT "a\\";b"; SELECT 2;'
        self.assertEqual(len(mm.split_statements(sql)), 2)

    def test_empty_statements_are_dropped(self):
        self.assertEqual(mm.split_statements(";;SELECT 1;;;"), ["SELECT 1"])


class StatementBoundaryTests(unittest.TestCase):
    def h(self, sql, statements=None):
        return mm.statement_hash(sql, statements)

    def test_trailing_semicolon_and_whitespace_are_equal(self):
        self.assertEqual(self.h("SELECT 1;"), self.h("  SELECT   1 ;  "))

    def test_two_statements_are_not_one_statement(self):
        self.assertNotEqual(self.h("SELECT 1; SELECT 2;"), self.h("SELECT 1 SELECT 2;"))

    def test_statement_order_matters(self):
        self.assertNotEqual(self.h("SELECT 1; SELECT 2;"), self.h("SELECT 2; SELECT 1;"))

    def test_semantically_different_statement_sequences_are_not_merged(self):
        two_updates = (
            "UPDATE accounts SET balance = balance - 10 WHERE id = 1; "
            "UPDATE accounts SET balance = balance + 10 WHERE id = 2;"
        )
        reversed_updates = (
            "UPDATE accounts SET balance = balance + 10 WHERE id = 2; "
            "UPDATE accounts SET balance = balance - 10 WHERE id = 1;"
        )
        one_do_block = (
            "DO $$ BEGIN "
            "UPDATE accounts SET balance = balance - 10 WHERE id = 1; "
            "UPDATE accounts SET balance = balance + 10 WHERE id = 2; "
            "END $$;"
        )
        # Same tokens, different execution order: not the same history.
        self.assertNotEqual(self.h(two_updates), self.h(reversed_updates))
        # Same inner statements, different execution context: not merged.
        self.assertNotEqual(self.h(two_updates), self.h(one_do_block))
        self.assertLess(mm.similarity(two_updates, reversed_updates), 1.0)
        self.assertLess(mm.similarity(two_updates, one_do_block), 1.0)

    def test_outer_begin_commit_are_ignored(self):
        self.assertEqual(
            self.h("BEGIN; CREATE TABLE t(); COMMIT;"),
            self.h("CREATE TABLE t();"),
        )
        self.assertEqual(
            self.h("BEGIN TRANSACTION; CREATE TABLE t(); COMMIT WORK;"),
            self.h("CREATE TABLE t();"),
        )

    def test_incomplete_outer_wrapper_is_preserved(self):
        self.assertNotEqual(self.h("BEGIN; CREATE TABLE t();"), self.h("CREATE TABLE t();"))

    def test_inner_transaction_is_preserved(self):
        wrapped = "BEGIN; CREATE TABLE a(); BEGIN; CREATE TABLE b(); COMMIT; COMMIT;"
        bare = "CREATE TABLE a(); CREATE TABLE b();"
        self.assertNotEqual(self.h(wrapped), self.h(bare))

    def test_dollar_tag_name_is_ignored(self):
        a = "CREATE FUNCTION f() RETURNS void AS $fn$ BEGIN PERFORM 1; END; $fn$ LANGUAGE plpgsql;"
        b = "CREATE FUNCTION f() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;"
        self.assertEqual(self.h(a), self.h(b))

    def test_string_literal_case_is_preserved(self):
        self.assertNotEqual(self.h("SELECT 'A';"), self.h("SELECT 'a';"))
        self.assertNotEqual(self.h("SELECT 'a;b';"), self.h("SELECT 'a b';"))

    def test_quoted_identifier_case_is_preserved(self):
        self.assertNotEqual(self.h('SELECT "A";'), self.h('SELECT "a";'))
        self.assertNotEqual(self.h('SELECT "A";'), self.h("SELECT A;"))

    def test_string_that_looks_like_a_comment_is_not_stripped(self):
        self.assertNotEqual(self.h("SELECT '-- not a comment';"), self.h("SELECT '';"))

    def test_plpgsql_semicolon_boundary_is_preserved(self):
        a = "CREATE FUNCTION f() RETURNS void AS $$ BEGIN x := 1; y := 2; END; $$ LANGUAGE plpgsql;"
        b = "CREATE FUNCTION f() RETURNS void AS $$ BEGIN x := 1 y := 2; END; $$ LANGUAGE plpgsql;"
        self.assertNotEqual(self.h(a), self.h(b))

    def test_production_array_boundaries_match_split_file(self):
        self.assertEqual(
            self.h("", ["SELECT 1", "SELECT 2"]),
            self.h("SELECT 1; SELECT 2;"),
        )
        self.assertEqual(
            self.h("", ["SELECT 1; SELECT 2;"]),
            self.h("SELECT 1; SELECT 2;"),
        )
        self.assertNotEqual(
            self.h("", ["SELECT 1 SELECT 2"]),
            self.h("SELECT 1; SELECT 2;"),
        )

    def test_comments_and_whitespace_inside_function_body_are_ignored(self):
        a = "CREATE FUNCTION f() RETURNS void AS $$ BEGIN -- note\n x := 1; y := 2; END; $$ LANGUAGE plpgsql;"
        b = "CREATE FUNCTION f() RETURNS void AS $$BEGIN x:=1;y:=2;END;$$ LANGUAGE plpgsql;"
        self.assertEqual(self.h(a), self.h(b))

    def test_empty_statements_do_not_change_hash(self):
        self.assertEqual(self.h("SELECT 1;;"), self.h("SELECT 1;"))


class SimilarityTests(unittest.TestCase):
    def test_similarity_respects_statement_boundaries(self):
        a = "SELECT 1; SELECT 2;"
        b = "SELECT 2; SELECT 1;"
        self.assertLess(mm.similarity(a, b), 1.0)

    def test_similarity_is_one_for_formatting_only(self):
        a = "CREATE FUNCTION f() RETURNS void AS $fn$ BEGIN PERFORM 1; END; $fn$ LANGUAGE plpgsql;"
        b = "CREATE FUNCTION f() RETURNS void AS $$BEGIN PERFORM 1; END;$$ LANGUAGE plpgsql;"
        self.assertEqual(mm.similarity(a, b), 1.0)


if __name__ == "__main__":
    unittest.main()
