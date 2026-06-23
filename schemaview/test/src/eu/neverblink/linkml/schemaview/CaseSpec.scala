package eu.neverblink.linkml.schemaview

import org.scalatest.matchers.should.Matchers
import org.scalatest.wordspec.AnyWordSpec

class CaseSpec extends AnyWordSpec, Matchers {
  "Case" should {
    "snake_case" in {
      Case.snake_case("") shouldBe ""
      Case.snake_case("abc") shouldBe "abc"
      Case.snake_case("abc_def") shouldBe "abc_def"
      Case.snake_case("abc_def1") shouldBe "abc_def1"
      Case.snake_case("abc_def_1") shouldBe "abc_def1"
      Case.snake_case("abc def") shouldBe "abc_def"
      Case.snake_case("AbcDef") shouldBe "abc_def"
      Case.snake_case("abcDef") shouldBe "abc_def"
      Case.snake_case("abcDef1") shouldBe "abc_def1"
      Case.snake_case("abc-def") shouldBe "abc_def"
      Case.snake_case("abc-def-1") shouldBe "abc_def1"
      Case.snake_case("abc-def-v1") shouldBe "abc_def_v1"
      Case.snake_case("ABC_DEF") shouldBe "abc_def"
      Case.snake_case("ABC-DEF") shouldBe "abc_def"
      Case.snake_case("ABC DEF") shouldBe "abc_def"
      Case.snake_case("iName") shouldBe "i_name"
      Case.snake_case("IName") shouldBe "i_name"
      Case.snake_case("httpHandler") shouldBe "http_handler"
      Case.snake_case("HTTPHandler") shouldBe "http_handler"
      Case.snake_case("HTTP") shouldBe "http"
    }
    "PascalCase" in {
      Case.PascalCase("") shouldBe ""
      Case.PascalCase("Abc") shouldBe "Abc"
      Case.PascalCase("AbcDef") shouldBe "AbcDef"
      Case.PascalCase("abc_def") shouldBe "AbcDef"
      Case.PascalCase("abc_def1") shouldBe "AbcDef1"
      Case.PascalCase("abc_def_1") shouldBe "AbcDef1"
      Case.PascalCase("abc def") shouldBe "AbcDef"
      Case.PascalCase("abcDef") shouldBe "AbcDef"
      Case.PascalCase("abcDef1") shouldBe "AbcDef1"
      Case.PascalCase("abc-def") shouldBe "AbcDef"
      Case.PascalCase("abc-def-1") shouldBe "AbcDef1"
      Case.PascalCase("abc-def-v1") shouldBe "AbcDefV1"
      Case.PascalCase("ABC_DEF") shouldBe "AbcDef"
      Case.PascalCase("ABC-DEF") shouldBe "AbcDef"
      Case.PascalCase("ABC DEF") shouldBe "AbcDef"
      Case.PascalCase("IName") shouldBe "IName"
      Case.PascalCase("HTTPHandler") shouldBe "HttpHandler"
      Case.PascalCase("HTTP") shouldBe "Http"
    }
    "camelCase" in {
      Case.camelCase("") shouldBe ""
      Case.camelCase("abc") shouldBe "abc"
      Case.camelCase("abcDef") shouldBe "abcDef"
      Case.camelCase("abc_def") shouldBe "abcDef"
      Case.camelCase("abc_def1") shouldBe "abcDef1"
      Case.camelCase("abc_def_1") shouldBe "abcDef1"
      Case.camelCase("abc def") shouldBe "abcDef"
      Case.camelCase("AbcDef") shouldBe "abcDef"
      Case.camelCase("AbcDef1") shouldBe "abcDef1"
      Case.camelCase("abc-def") shouldBe "abcDef"
      Case.camelCase("abc-def-1") shouldBe "abcDef1"
      Case.camelCase("abc-def-v1") shouldBe "abcDefV1"
      Case.camelCase("ABC_DEF") shouldBe "abcDef"
      Case.camelCase("ABC-DEF") shouldBe "abcDef"
      Case.camelCase("ABC DEF") shouldBe "abcDef"
      Case.camelCase("IName") shouldBe "iName"
      Case.camelCase("HTTPHandler") shouldBe "httpHandler"
      Case.camelCase("HTTP") shouldBe "http"
    }
  }
}
