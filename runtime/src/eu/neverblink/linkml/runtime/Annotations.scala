package eu.neverblink.linkml.runtime

import scala.annotation.StaticAnnotation
import scala.annotation.meta.field

@field final class named(name: String) extends StaticAnnotation

@field final class id extends StaticAnnotation

@field final class value extends StaticAnnotation

@field final class simpleDict extends StaticAnnotation

@field final class compactDict extends StaticAnnotation

@field final class expandedDict extends StaticAnnotation
